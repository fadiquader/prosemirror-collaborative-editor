const Y = require('yjs');
const encoding = require('lib0/dist/encoding.cjs');
const binary = require('lib0/dist/binary.cjs');
const promise = require('lib0/dist/promise.cjs');
const { Buffer } = require('buffer');

const { MongoAdapter } = require("./mongo-adapter");

const PREFERRED_TRIM_SIZE = 400;

const clearUpdatesRange = async (db, docName, from, to) => db.del({
  docName,
  clock: {
    $gte: from,
    $lt: to
  }
});

const flushDocument = async (db, docName, stateAsUpdate, stateVector) => {
  const clock = await storeUpdate(db, docName, stateAsUpdate);
  await writeStateVector(db, docName, stateVector, clock);
  await clearUpdatesRange(db, docName, 0, clock); // intentionally not waiting for the promise to resolve!
  return clock;
};

const createDocumentUpdateKey = (docName, clock) => ({
  version: 'v1',
  docName,
  action: 'update',
  clock: clock
});
const createDocumentStateVectorKey = (docName) => {
  return {
    docName: docName,
    version: 'v1_sv'
  }
};

const mongoPut = async (db, values) => db.put(values);

const getMongoBulkData = (db, query, opts) => db.readAsCursor(query, opts);

const getMongoUpdates = async (db, docName, opts = {}) => getMongoBulkData(db, {
    ...createDocumentUpdateKey(docName, 0),
    clock: {
      $gte: 0,
      $lt: binary.BITS32,
    }},
  opts
);

const getCurrentUpdateClock = (db, docName) =>  getMongoUpdates(db, docName, { reverse: true, limit: 1 }).then(updates => {
  if (updates.length === 0) {
    return -1
  } else {
    return updates[0].clock;
  }
});

const writeStateVector = async (db, docName, sv, clock) => {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint8Array(encoder, sv);
  await mongoPut(db, {
    ...createDocumentStateVectorKey(docName),
    value: Buffer.from(encoding.toUint8Array(encoder)),
    clock
  })
};

const storeUpdate = async (db, docName, update) => {
  const clock = await getCurrentUpdateClock(db, docName);
  if (clock === -1) {
    // make sure that a state vector is aways written, so we can search for available documents
    const ydoc = new Y.Doc()
    Y.applyUpdate(ydoc, update);
    const sv = Y.encodeStateVector(ydoc)
    await writeStateVector(db, docName, sv, 0)
  }
  await mongoPut(db, {
    ...createDocumentUpdateKey(docName, clock + 1),
    value: Buffer.from(update)
  });
  return clock + 1
};

class MongodbPersistence {
  constructor(location, collection) {
    const db = new MongoAdapter(location, collection);
    this.tr = promise.resolve();

    this._transact = f => {
      const currTr = this.tr;
      this.tr = (async () => {
        await currTr;
        let res = /** @type {any} */ (null);
        try {
          res = await f(db)
        } catch (err) {
          console.warn('Error during saving transaction', err)
        }
        return res
      })();
      return this.tr
    }
  }

  /**
   * @param {string} docName
   * @return {Promise<Y.Doc>}
   */
  getYDoc(docName) {
    return this._transact(async db => {
      const updates = (await  getMongoUpdates(db, docName)).map(update => update.value.buffer);
      const ydoc = new Y.Doc();
      ydoc.transact(() => {
        for (let i = 0; i < updates.length; i++) {
          Y.applyUpdate(ydoc, updates[i])
        }
      });
      if (updates.length > PREFERRED_TRIM_SIZE) {
        await flushDocument(db, docName, Y.encodeStateAsUpdate(ydoc), Y.encodeStateVector(ydoc))
      }
      return ydoc
    });
  }

  /**
   * @param {string} docName
   * @param {Uint8Array} update
   * @return {Promise<number>} Returns the clock of the stored update
   */
  storeUpdate(docName, update) {
    return this._transact(db => storeUpdate(db, docName, update))
  }

  /**
   * @param {string} docName
   * @return {Promise<void>}
   */
  clearDocument (docName) {
    return this._transact(async db => {
      await db.del(createDocumentStateVectorKey(docName));
      await clearUpdatesRange(db, docName, 0, binary.BITS32,);
    })
  }
}

module.exports.MongodbPersistence = MongodbPersistence;
