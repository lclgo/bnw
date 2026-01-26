import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DocEditor from "../components/DocEditor";
import DocTree from "../components/DocTree";
import { getDocTree } from "../services/storage";
import "./WikiPage.css";

export default function WikiPage() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSelect = useCallback(
    (id: string) => {
      if (id) {
        navigate(`/doc/${id}`);
      } else {
        navigate("/");
      }
    },
    [navigate]
  );

  const handleTreeChange = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!docId) {
      const tree = getDocTree();
      if (tree.length > 0) {
        navigate(`/doc/${tree[0].id}`, { replace: true });
      }
    }
  }, [docId, navigate, refreshKey]);

  return (
    <div className="wiki-page">
      <DocTree
        selectedId={docId || null}
        onSelect={handleSelect}
        refreshKey={refreshKey}
        onTreeChange={handleTreeChange}
      />
      <DocEditor key={docId || "empty"} docId={docId || ""} onTitleChange={handleTreeChange} />
    </div>
  );
}
