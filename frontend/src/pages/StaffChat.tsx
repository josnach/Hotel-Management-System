import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Circle, LoaderCircle, MessageCircle, Plus, Send, Users, X } from 'lucide-react';
import { api, tokenStore } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/common';

type Staff = { id: string; username: string; fullName: string | null; role: string };
type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  sender: Staff;
};
type Conversation = {
  id: string;
  type: 'DIRECT' | 'GROUP';
  name: string | null;
  title: string;
  members: Staff[];
  lastMessage: ChatMessage | null;
  unreadCount: number;
  updatedAt: string;
};

type SocketEvent = {
  type: string;
  conversationId?: string;
  message?: ChatMessage;
};

const staffName = (staff: Staff) => staff.fullName || staff.username;
const timeLabel = (value?: string) => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

export default function StaffChat() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [socketConnected, setSocketConnected] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [chatType, setChatType] = useState<'DIRECT' | 'GROUP'>('DIRECT');
  const [groupName, setGroupName] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const activeIdRef = useRef<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const loadConversations = useCallback(async () => {
    const rows = await api.get<Conversation[]>('/staff-chat/conversations');
    setConversations(rows);
    return rows;
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    const rows = await api.get<ChatMessage[]>(`/staff-chat/conversations/${id}/messages`);
    setMessages(rows);
    await api.post(`/staff-chat/conversations/${id}/read`);
    setConversations((current) => current.map((c) => c.id === id ? { ...c, unreadCount: 0 } : c));
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.get<Conversation[]>('/staff-chat/conversations'),
      api.get<Staff[]>('/staff-chat/users'),
    ]).then(([rows, users]) => {
      if (!alive) return;
      setConversations(rows);
      setStaff(users);
      if (rows.length) setActiveId((current) => current && rows.some((r) => r.id === current) ? current : rows[0].id);
    }).catch((e: Error) => { if (alive) setError(e.message || 'Could not load staff chat.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    loadMessages(activeId).catch((e: Error) => setError(e.message || 'Could not load messages.'));
  }, [activeId, loadMessages]);

  useEffect(() => {
    let stopped = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 1000;
    let socket: WebSocket | null = null;

    const connect = () => {
      if (stopped) return;
      const token = tokenStore.get();
      if (!token) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${window.location.host}/ws/staff-chat`);
      socketRef.current = socket;
      socket.onopen = () => socket?.send(JSON.stringify({ type: 'auth', token }));
      socket.onmessage = (event) => {
        let data: SocketEvent;
        try { data = JSON.parse(String(event.data)) as SocketEvent; } catch { return; }
        if (data.type === 'authenticated') {
          setSocketConnected(true);
          retryDelay = 1000;
          return;
        }
        if (data.type === 'chat_message' && data.message && data.conversationId) {
          const incoming = data.message;
          setConversations((current) => {
            const next = current.map((c) => c.id === data.conversationId ? { ...c, lastMessage: incoming, updatedAt: incoming.createdAt, unreadCount: activeIdRef.current === c.id ? 0 : c.unreadCount + (incoming.senderId === user?.id ? 0 : 1) } : c);
            return next.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          });
          if (activeIdRef.current === data.conversationId) {
            setMessages((current) => current.some((m) => m.id === incoming.id) ? current : [...current, incoming]);
            void api.post(`/staff-chat/conversations/${data.conversationId}/read`).catch(() => undefined);
          } else {
            void loadConversations().catch(() => undefined);
          }
        } else if (data.type === 'conversation_created' || data.type === 'chat_unread') {
          void loadConversations().catch(() => undefined);
        }
      };
      socket.onclose = () => {
        setSocketConnected(false);
        if (stopped) return;
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 15000);
      };
      socket.onerror = () => socket?.close();
    };
    connect();
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
      socketRef.current = null;
      setSocketConnected(false);
    };
  }, [loadConversations, user?.id]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, activeId]);

  const activeConversation = useMemo(() => conversations.find((c) => c.id === activeId) ?? null, [conversations, activeId]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!activeId || !body || sending) return;
    setSending(true); setError('');
    try {
      const message = await api.post<ChatMessage>(`/staff-chat/conversations/${activeId}/messages`, { body });
      setMessages((current) => current.some((m) => m.id === message.id) ? current : [...current, message]);
      setDraft('');
      await loadConversations();
    } catch (e) { setError(e instanceof Error ? e.message : 'Message could not be sent.'); }
    finally { setSending(false); }
  }

  async function createConversation(event: FormEvent) {
    event.preventDefault();
    if (!selectedStaff.length) { setError('Select at least one staff member.'); return; }
    if (chatType === 'GROUP' && !groupName.trim()) { setError('Enter a name for the group.'); return; }
    setError('');
    try {
      const created = await api.post<{ id: string }>('/staff-chat/conversations', {
        type: chatType,
        ...(chatType === 'GROUP' ? { name: groupName.trim() } : {}),
        memberIds: chatType === 'DIRECT' ? [selectedStaff[0]] : selectedStaff,
      });
      const rows = await loadConversations();
      setActiveId(created.id);
      if (!rows.some((row) => row.id === created.id)) await loadConversations();
      setShowNew(false); setGroupName(''); setSelectedStaff([]); setChatType('DIRECT');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create conversation.'); }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Staff Chat" subtitle="Private messages and team conversations for hotel staff." />
      {error && <div role="alert" className="flex items-start justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X className="h-4 w-4" /></button></div>}
      <div className="grid min-h-[620px] grid-cols-1 overflow-hidden rounded-xl border bg-white shadow-sm md:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b md:border-b-0 md:border-r">
          <div className="flex items-center justify-between border-b p-4">
            <div><h2 className="font-semibold">Conversations</h2><p className="text-xs text-slate-500">{conversations.length} chat{conversations.length === 1 ? '' : 's'}</p></div>
            <button onClick={() => { setShowNew(true); setError(''); }} className="inline-flex items-center gap-1 rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800"><Plus className="h-4 w-4" /> New</button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? <div className="flex items-center gap-2 p-5 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading chats…</div> : conversations.length === 0 ? <div className="p-6 text-center text-sm text-slate-500"><MessageCircle className="mx-auto mb-2 h-8 w-8" />No chats yet. Select New to start one.</div> : conversations.map((conversation) => (
              <button key={conversation.id} onClick={() => setActiveId(conversation.id)} className={`w-full border-b px-4 py-3 text-left hover:bg-slate-50 ${activeId === conversation.id ? 'bg-blue-50' : ''}`}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-800">{conversation.type === 'GROUP' ? <Users className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}</span>
                  <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold">{conversation.title}</span><span className="shrink-0 text-[10px] text-slate-500">{timeLabel(conversation.lastMessage?.createdAt || conversation.updatedAt)}</span></span><span className="mt-1 block truncate text-xs text-slate-500">{conversation.lastMessage ? `${conversation.lastMessage.sender.fullName || conversation.lastMessage.sender.username}: ${conversation.lastMessage.body}` : `${conversation.members.length} members · No messages yet`}</span></span>
                  {conversation.unreadCount > 0 && <span className="mt-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-700 px-1 text-[10px] font-bold text-white">{conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}</span>}
                </div>
              </button>
            ))}
          </div>
        </aside>
        <section className="flex min-h-[560px] min-w-0 flex-col">
          {activeConversation ? <>
            <header className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-semibold">{activeConversation.title}</h2><p className="text-xs text-slate-500">{activeConversation.type === 'GROUP' ? `${activeConversation.members.length} staff members` : 'Private direct message'}</p></div><span className={`inline-flex items-center gap-1 text-xs ${socketConnected ? 'text-green-700' : 'text-amber-700'}`}><Circle className="h-2.5 w-2.5 fill-current" />{socketConnected ? 'Live' : 'Reconnecting…'}</span></header>
            <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4 sm:p-6">
              {messages.length === 0 && <div className="py-10 text-center text-sm text-slate-500">No messages yet. Send the first message.</div>}
              {messages.map((message) => {
                const mine = message.senderId === user?.id;
                return <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-xl px-3 py-2 shadow-sm ${mine ? 'bg-blue-700 text-white' : 'border bg-white text-slate-800'}`}><p className={`mb-1 text-[11px] font-semibold ${mine ? 'text-blue-100' : 'text-blue-800'}`}>{staffName(message.sender)}</p><p className="whitespace-pre-wrap break-words text-sm">{message.body}</p><p className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${mine ? 'text-blue-100' : 'text-slate-400'}`}>{timeLabel(message.createdAt)} {mine && <Check className="h-3 w-3" />}</p></div></div>;
              })}
              <div ref={endRef} />
            </div>
            <form onSubmit={sendMessage} className="flex items-end gap-2 border-t bg-white p-3 sm:p-4"><textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={4000} rows={2} placeholder="Write a message…" className="max-h-36 min-h-11 flex-1 resize-y rounded-md border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} /><button disabled={!draft.trim() || sending} className="inline-flex h-11 items-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" />{sending ? 'Sending' : 'Send'}</button></form>
          </> : <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-slate-500"><MessageCircle className="mb-3 h-12 w-12" /><h2 className="font-semibold text-slate-800">Your staff conversations</h2><p className="mt-1 max-w-sm text-sm">Choose a conversation or create a new direct message or team group.</p><button onClick={() => setShowNew(true)} className="mt-4 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white">Start chatting</button></div>}
        </section>
      </div>

      {showNew && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><form onSubmit={createConversation} className="w-full max-w-lg space-y-4 rounded-xl bg-white p-5 shadow-xl"><div className="flex items-start justify-between"><div><h2 className="text-lg font-semibold">Start a conversation</h2><p className="text-sm text-slate-500">Choose a colleague or create a team group.</p></div><button type="button" onClick={() => setShowNew(false)} aria-label="Close" className="rounded-md p-1 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
        <div className="grid grid-cols-2 rounded-md bg-slate-100 p-1"><button type="button" onClick={() => { setChatType('DIRECT'); setSelectedStaff([]); }} className={`rounded px-3 py-2 text-sm font-medium ${chatType === 'DIRECT' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>Direct message</button><button type="button" onClick={() => { setChatType('GROUP'); setSelectedStaff([]); }} className={`rounded px-3 py-2 text-sm font-medium ${chatType === 'GROUP' ? 'bg-white shadow-sm' : 'text-slate-500'}`}>Group chat</button></div>
        {chatType === 'GROUP' && <label className="block space-y-1 text-sm font-medium">Group name<input value={groupName} onChange={(e) => setGroupName(e.target.value)} maxLength={80} required className="w-full rounded-md border px-3 py-2 font-normal" placeholder="e.g. Kitchen Team" /></label>}
        <div><p className="mb-2 text-sm font-medium">Select staff {chatType === 'DIRECT' ? '(one person)' : '(one or more people)'}</p><div className="max-h-64 space-y-1 overflow-y-auto rounded-md border p-2">{staff.length === 0 ? <p className="p-3 text-sm text-slate-500">No other active staff accounts found.</p> : staff.map((person) => <label key={person.id} className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-slate-50"><input type={chatType === 'DIRECT' ? 'radio' : 'checkbox'} name="staff-member" checked={selectedStaff.includes(person.id)} onChange={() => setSelectedStaff((current) => chatType === 'DIRECT' ? [person.id] : current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id])} /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{staffName(person)}</span><span className="block text-xs text-slate-500">{person.role} · @{person.username}</span></span></label>)}</div></div>
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowNew(false)} className="rounded-md border px-4 py-2 text-sm">Cancel</button><button type="submit" disabled={!selectedStaff.length || (chatType === 'GROUP' && !groupName.trim())} className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Create chat</button></div>
      </form></div>}
    </div>
  );
}

