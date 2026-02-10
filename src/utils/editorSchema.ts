import { codeBlockOptions } from "@blocknote/code-block";
import { BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs } from "@blocknote/core";
import { createHighlighter } from "shiki";

export const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock: createCodeBlockSpec({
      ...codeBlockOptions,
      createHighlighter: async () => {
        const highlighter = await createHighlighter({
          themes: ["github-light"],
          langs: Object.keys(codeBlockOptions.supportedLanguages) as any[],
        });
        return highlighter as any;
      },
    }),
  },
});
