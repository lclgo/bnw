import "@blocknote/mantine/style.css"; // 引入默认样式
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import WikiPage from "./pages/WikiPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<WikiPage />} />
        <Route path="/doc/:docId" element={<WikiPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
