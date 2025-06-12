import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { QuillBinding } from 'y-quill';
import Quill from 'quill';

export const setupYjs = (
  docId: string,
  quill: Quill,
  username: string
) => {
  const ydoc = new Y.Doc();

  const provider = new WebsocketProvider('ws://192.168.43.104:1234', docId, ydoc);
  const ytext = ydoc.getText('quill');

  const binding = new QuillBinding(ytext, quill);

  provider.awareness.setLocalStateField('user', {
    name: username,
    color: '#'+Math.floor(Math.random()*16777215).toString(16)
  });

  return { ydoc, provider, binding };
};
