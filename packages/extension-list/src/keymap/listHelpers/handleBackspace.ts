import type { Editor } from '@tiptap/core'
import { isAtStartOfNode, isNodeActive } from '@tiptap/core'
import { joinTextblockBackward } from '@tiptap/pm/commands'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Fragment } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'

import { hasListBefore } from './hasListBefore.js'

export const handleBackspace = (editor: Editor, name: string, parentListTypes: string[]) => {
  // this is required to still handle the undo handling
  if (editor.commands.undoInputRule()) {
    return true
  }

  // if the selection is not collapsed
  // we can rely on the default backspace behavior
  if (editor.state.selection.from !== editor.state.selection.to) {
    return false
  }

  // if the current item is NOT inside a list item &
  // the previous item is a list (orderedList or bulletList)
  // move the cursor into the list and delete the current item
  if (!isNodeActive(editor.state, name) && hasListBefore(editor.state, name, parentListTypes)) {
    const { $anchor } = editor.state.selection

    const $listPos = editor.state.doc.resolve($anchor.before() - 1)

    const listDescendants: Array<{ node: PMNode; pos: number }> = []

    $listPos.node().descendants((node, pos) => {
      if (node.type.name === name) {
        listDescendants.push({ node, pos })
      }
    })

    const lastItem = listDescendants.at(-1)

    if (!lastItem) {
      return false
    }

    const $lastItemPos = editor.state.doc.resolve($listPos.start() + lastItem.pos + 1)
    const lastItemNode = $lastItemPos.node()

    // the paragraph can only be joined into the last item if the item's content
    // allows another block at its end (not the case for e.g. `content: 'paragraph'`).
    // Otherwise move the paragraph into a new list item after the last item.
    if (
      !lastItemNode.canReplace(
        lastItemNode.childCount,
        lastItemNode.childCount,
        Fragment.from($anchor.parent),
      )
    ) {
      const newItem = lastItemNode.type.createAndFill(null, $anchor.parent)

      if (!newItem) {
        return false
      }

      let paragraphOffset = 0

      newItem.forEach((child, offset) => {
        if (child === $anchor.parent) {
          paragraphOffset = offset
        }
      })

      return editor
        .chain()
        .command(({ tr }) => {
          const target = $lastItemPos.after()

          tr.delete($anchor.before(), $anchor.after()).insert(target, newItem)
          tr.setSelection(TextSelection.create(tr.doc, target + 1 + paragraphOffset + 1))

          return true
        })
        .run()
    }

    return editor
      .chain()
      .command(({ tr }) => {
        const target = $lastItemPos.end()

        tr.delete($anchor.before(), $anchor.after()).insert(target, $anchor.parent)
        tr.setSelection(TextSelection.create(tr.doc, target + 1))

        return true
      })
      .command(({ state, dispatch }) => {
        joinTextblockBackward(state, dispatch)

        return true
      })
      .run()
  }

  // if the cursor is not inside the current node type
  // do nothing and proceed
  if (!isNodeActive(editor.state, name)) {
    return false
  }

  // if the cursor is not at the start of a node
  // do nothing and proceed
  if (!isAtStartOfNode(editor.state)) {
    return false
  }

  // only intercept at the start of the list item's first child
  const { $from } = editor.state.selection
  const itemDepth = $from.depth - 1
  if ($from.node(itemDepth).type !== editor.schema.nodes[name] || $from.index(itemDepth) !== 0) {
    return false
  }

  return editor.chain().liftListItem(name).run()
}
