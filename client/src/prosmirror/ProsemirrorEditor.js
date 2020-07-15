import React, {useEffect, useRef, useCallback, useState} from 'react'
import * as Y from "yjs";
import {WebsocketProvider} from 'y-websocket'
import {ySyncPlugin, yCursorPlugin, yUndoPlugin, undo, redo} from 'y-prosemirror'
import {EditorState, Plugin, PluginKey} from 'prosemirror-state'
import {EditorView} from 'prosemirror-view'
import {schema} from './schema'
import {keymap} from 'prosemirror-keymap'
import { DOMParser, DOMSerializer } from 'prosemirror-model'
import {setupEditor} from "./setup-editor";
// import {Toolbar} from "./Toolbar";
import './style.css';

function useForceUpdate() {
  const [, forceUpdate] = React.useState();

  return useCallback(() => {
    forceUpdate(s => !s);
  }, []);
}

const reactPropsKey = new PluginKey("reactProps");

function reactProps(initialProps) {
  return new Plugin({
    key: reactPropsKey,
    state: {
      init: () => initialProps,
      apply: (tr, prev) => tr.getMeta(reactPropsKey) || prev,
    },
  });
}

const exportHTML = state => {
  const jsonState = state.doc.toJSON()
  console.log(jsonState)
  const div = document.createElement('div')
  const fragment = DOMSerializer
    .fromSchema(schema)
    .serializeFragment(state.doc.content)
  div.appendChild(fragment)
  return div.innerHTML;
};
const parseHTML = content => {
  let domNode = document.createElement("div");
  domNode.innerHTML = content;
  return DOMParser.fromSchema(schema).parse(domNode);
};

export const ProsemirrorEditor = props => {
  const forceUpdate = useForceUpdate();
  const editorRef = useRef();
  const ydoc = useRef();
  const provider = useRef();
  const prosemirrorView = useRef();

  useEffect(() => {
    ydoc.current = new Y.Doc();
    provider.current = new WebsocketProvider('ws://localhost:8080', 'prosemirror', ydoc.current);
    provider.current.connect();

    const type = ydoc.current.getXmlFragment('prosemirror');
    const plugins = [
      ySyncPlugin(type),
      yCursorPlugin(provider.current.awareness),
      yUndoPlugin(),
      keymap({
        'Mod-z': undo,
        'Mod-y': redo,
        'Mod-Shift-z': redo,
        "Mod-s": (state, dispatch) => {
          const jsonState = state.doc.toJSON()
          console.log(JSON.stringify(jsonState))
          console.log(exportHTML(state))
          return true;
        },
      }),
      reactProps(props)
    ].concat(setupEditor({ schema }));
    // '{"type":"doc","content":[{"type":"paragraph","attrs":{"ychange":null},"content":[{"type":"text","text":"fadi"}]}]}'
    {/*<p><strong>fadi</strong> </p><p>qua</p>*/}
    prosemirrorView.current = new EditorView(editorRef.current, {
      state: EditorState.create({
        schema,
        plugins,
        // doc: DOMParser.fromSchema(schema).parse()
        doc: parseHTML('<p><strong>fadi</strong> </p><p>qua</p>')
      })
    });
    forceUpdate();
    return () => {
      provider.current.disconnect();
      prosemirrorView.current.destroy();
    }
  }, []);

  return (
    <div>
      <div id="editor" ref={editorRef}>
        {/*<Toolbar*/}
          {/*editorView={prosemirrorView.current}*/}
          {/*editorWrapper={editorRef}*/}
        {/*/>*/}
      </div>
    </div>
  )
}
