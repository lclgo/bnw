import "@blocknote/mantine/style.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import MobilePage from "./pages/MobilePage";
import WikiPage from "./pages/WikiPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<WikiPage />} />
        <Route path="/doc/:docId" element={<WikiPage />} />
        <Route path="/m" element={<MobilePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
