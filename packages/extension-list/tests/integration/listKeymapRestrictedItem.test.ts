import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { ListItem, TaskItem, TaskList } from '../../src/index.js'

function findTextStart(editor: Editor, text: string) {
  let position: number | undefined

  editor.state.doc.descendants((node, pos) => {
    if (node.isText && node.text === text) {
      position = pos
    }
  })

  if (position === undefined) {
    throw new Error(`Could not find text "${text}"`)
  }

  return position
}

function pressKey(editor: Editor, key: string, init: KeyboardEventInit = {}) {
  return editor.view.someProp('handleKeyDown', handler =>
    handler(
      editor.view,
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }),
    ),
  )
}

describe('ListKeymap Backspace after a list with restricted item content (#8797)', () => {
  let editor: Editor

  afterEach(() => {
    editor?.destroy()
    vi.restoreAllMocks()
  })

  it.each([
    [
      'bullet list',
      '<ul><li><p>one</p></li></ul><p>two</p>',
      '<ul><li><p>one</p></li><li><p>two</p></li></ul>',
    ],
    [
      'ordered list',
      '<ol><li><p>one</p></li></ol><p>two</p>',
      '<ol><li><p>one</p></li><li><p>two</p></li></ol>',
    ],
  ])('moves the paragraph into the %s as a new item', (_, content, expected) => {
    const warn = vi.spyOn(console, 'warn')

    editor = new Editor({
      extensions: [
        StarterKit.configure({ listItem: false, trailingNode: false }),
        ListItem.extend({ content: 'paragraph' }),
      ],
      content,
    })
    editor.commands.setTextSelection(findTextStart(editor, 'two'))
    const originalHTML = editor.getHTML()

    expect(pressKey(editor, 'Backspace')).toBe(true)
    expect(editor.getHTML()).toBe(expected)
    expect(editor.state.selection.empty).toBe(true)
    expect(editor.state.selection.from).toBe(findTextStart(editor, 'two'))
    expect(warn).not.toHaveBeenCalled()

    expect(editor.commands.undo()).toBe(true)
    expect(editor.getHTML()).toBe(originalHTML)
  })

  it('handles Mod-Backspace the same way', () => {
    editor = new Editor({
      extensions: [
        StarterKit.configure({ listItem: false, trailingNode: false }),
        ListItem.extend({ content: 'paragraph' }),
      ],
      content: '<ul><li><p>one</p></li></ul><p>two</p>',
    })
    editor.commands.setTextSelection(findTextStart(editor, 'two'))

    const mod = /Mac|iP(hone|[oa]d)/.test(navigator.platform)
      ? { metaKey: true }
      : { ctrlKey: true }

    expect(pressKey(editor, 'Backspace', mod)).toBe(true)
    expect(editor.getHTML()).toBe('<ul><li><p>one</p></li><li><p>two</p></li></ul>')
  })

  it('moves the paragraph into a task list with restricted task items', () => {
    editor = new Editor({
      extensions: [
        StarterKit.configure({ trailingNode: false }),
        TaskList,
        TaskItem.extend({ content: 'paragraph' }),
      ],
      content:
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>one</p></li></ul><p>two</p>',
    })
    editor.commands.setTextSelection(findTextStart(editor, 'two'))

    expect(pressKey(editor, 'Backspace')).toBe(true)
    expect(editor.state.doc.childCount).toBe(1)
    expect(editor.state.doc.firstChild?.type.name).toBe('taskList')
    expect(editor.state.doc.firstChild?.childCount).toBe(2)
    expect(editor.state.doc.firstChild?.lastChild?.textContent).toBe('two')
    expect(editor.state.selection.from).toBe(findTextStart(editor, 'two'))
  })

  it('still joins the paragraph into the last item when the item allows more blocks', () => {
    editor = new Editor({
      extensions: [StarterKit.configure({ trailingNode: false })],
      content: '<ul><li><p>one</p></li></ul><p>two</p>',
    })
    editor.commands.setTextSelection(findTextStart(editor, 'two'))

    expect(pressKey(editor, 'Backspace')).toBe(true)
    expect(editor.getHTML()).toBe('<ul><li><p>onetwo</p></li></ul>')
    expect(editor.state.selection.from).toBe(findTextStart(editor, 'onetwo') + 3)
  })
})
