import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { MessageCircle, Send, X, RotateCcw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { askSupport } from "@/lib/support-chat.functions";
import { Button } from "@/components/ui/button";

type Msg = { role: "user" | "assistant"; content: string };
const SUGGESTIONS = [
  "Como funciona o teste de 7 dias?",
  "Como integro com meu MikroTik?",
  "O que dá para fazer na Rede FTTH?",
  "Preciso de IP público?",
];

export function SupportChat() {
  const ask = useServerFn(askSupport);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
    if (open && !loading) inputRef.current?.focus();
  }, [msgs, loading, open]);

  async function send(q: string) {
    const content = q.trim();
    if (!content || loading) return;
    const next = [...msgs, { role: "user" as const, content }];
    setMsgs(next);
    setText("");
    setLoading(true);
    try {
      const r = await ask({ data: { messages: next } });
      setMsgs([...next, { role: "assistant", content: r.reply }]);
    } catch {
      setMsgs([...next, { role: "assistant", content: "Não consegui responder agora. Tente de novo." }]);
    } finally {
      setLoading(false);
    }
  }

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg"
        aria-label="Abrir chat de dúvidas"
      >
        <MessageCircle className="h-5 w-5" /> Tire dúvidas com nossa IA
      </button>
    );

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 flex h-[75vh] flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl sm:inset-x-auto sm:right-5 sm:w-96">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2 font-semibold">
          <img src="/syncron-logo.png" alt="" className="h-6 w-6" /> Assistente Syncron
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={() => setMsgs([])} aria-label="Limpar conversa"><RotateCcw className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" onClick={() => setOpen(false)} aria-label="Fechar"><X className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
        {msgs.length === 0 && (
          <div className="space-y-2">
            <p className="text-muted-foreground">Olá! Pergunte qualquer coisa sobre o Syncron ISP.</p>
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => send(s)} className="block w-full rounded-lg border px-3 py-2 text-left hover:bg-accent">{s}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-primary-foreground">{m.content}</div>
          ) : (
            <div key={i} className="prose prose-sm max-w-none dark:prose-invert [&_p]:my-1 [&_ul]:my-1">
              <ReactMarkdown>{m.content}</ReactMarkdown>
            </div>
          ),
        )}
        {loading && <p className="animate-pulse text-muted-foreground">Digitando…</p>}
        <div ref={endRef} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex gap-2 border-t p-3">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
          rows={1}
          placeholder="Digite sua dúvida…"
          className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <Button type="submit" size="icon" disabled={loading || !text.trim()} aria-label="Enviar"><Send className="h-4 w-4" /></Button>
      </form>
    </div>
  );
}
