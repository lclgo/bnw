import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css"; // 引入默认样式

function App() {
  // 1. 创建编辑器实例
  const editor = useCreateBlockNote();

  // 2. 渲染视图
  return (
    <div className="wiki-container">
      <h1>我的 Wiki 页面</h1>
      <BlockNoteView editor={editor} theme="light" />
    </div>
  );
}
export default App;
