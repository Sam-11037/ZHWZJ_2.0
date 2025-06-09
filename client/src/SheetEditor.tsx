import React from 'react';
import { useParams } from 'react-router-dom';

const SheetEditor: React.FC = () => {
  const { id } = useParams();
  return (
    <div style={{ padding: 40 }}>
      <h2>表格编辑器（开发中）</h2>
      <div>文档ID：{id}</div>
    </div>
  );
};

export default SheetEditor;