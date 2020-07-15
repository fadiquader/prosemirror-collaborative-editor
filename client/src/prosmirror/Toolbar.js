import React from 'react';
import { schema } from "./schema";

export const Toolbar = props => {
  const { editorWrapper, editorView } = props;
  console.log('editorView ', editorView)
  const markActive = (state, type) => {
    let {from, $from, to, empty} = state.selection
    if (empty) return type.isInSet(state.storedMarks || $from.marks())
    else return state.doc.rangeHasMark(from, to, type)
  }
  return (
    <div>
      <span>Bold</span>
    </div>
  )
};
