import { codeBlockOptions } from "@blocknote/code-block";
import { BlockNoteSchema, createCodeBlockSpec, createExtension, defaultBlockSpecs } from "@blocknote/core";
import { insertOrUpdateBlockForSlashMenu } from "@blocknote/core/extensions";
import { createReactBlockSpec } from "@blocknote/react";

const noteBlock = createReactBlockSpec(
  {
    type: "note" as const,
    propSchema: {},
    content: "inline",
  },
  {
    render: ({ contentRef }) => {
      return (
        <div className="note-block-wrapper">
          <div className="note-block-icon">📌</div>
          <div className="note-block-content" ref={contentRef} />
        </div>
      );
    },
  },
  [
    createExtension({
      key: "note-block-keyboard-shortcuts",
      keyboardShortcuts: {
        Enter: ({ editor }) => {
          return editor.transact((tr) => {
            const { block } = editor.getTextCursorPosition();
            if (block.type !== "note") {
              return false;
            }
            const { head } = tr.selection;
            const hardBreak = tr.doc.type.schema.nodes.hardBreak.create();
            tr.insert(head, hardBreak);
            return true;
          });
        },
        "Shift-Enter": ({ editor }) => {
          const { block } = editor.getTextCursorPosition();
          if (block.type !== "note") {
            return false;
          }
          const [newBlock] = editor.insertBlocks(
            [{ type: "paragraph" }],
            block,
            "after",
          );
          editor.setTextCursorPosition(newBlock, "start");
          return true;
        },
      },
    }),
  ],
);

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock: createCodeBlockSpec({
      ...codeBlockOptions,
      createHighlighter: async () => {
        const highlighter = await codeBlockOptions.createHighlighter!();
        const origGetLoadedThemes = highlighter.getLoadedThemes.bind(highlighter);
        highlighter.getLoadedThemes = () => {
          const themes = origGetLoadedThemes();
          const idx = themes.indexOf("github-light");
          if (idx > 0) {
            themes.splice(idx, 1);
            themes.unshift("github-light");
          }
          return themes;
        };
        return highlighter;
      },
    }),
    note: noteBlock(),
  },
});

export type EditorSchema = typeof schema;

export function getNoteSlashMenuItem(editor: EditorSchema["BlockNoteEditor"]) {
  return {
    title: "Note",
    subtext: "Insert a highlighted note block",
    group: "Users",
    aliases: ["note", "callout", "highlight", "notice"],
    icon: <span style={{ fontSize: 18 }}>📌</span>,
    onItemClick: () => {
      insertOrUpdateBlockForSlashMenu(editor, {
        type: "note",
      } as any);
    },
  };
}
