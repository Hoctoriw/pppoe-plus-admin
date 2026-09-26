import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listLicensePlans, createLicensePayment, getLicenseCheckoutMode, createAutoLicensePayment, checkLicensePayment } from "@/lib/users.functions";
import { pixPayload } from "@/lib/pix";

type Plan = Awaited<ReturnType<typeof listLicensePlans>>[number];
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PixCheckout() {
  const plansFn = useServerFn(listLicensePlans), payFn = useServerFn(createLicensePayment);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [qr, setQr] = useState<{ img: string; code: string; plan: Plan } | null>(null);
  const [msg, setMsg] = useState("");
  const modeFn = useServerFn(getLicenseCheckoutMode), autoFn = useServerFn(createAutoLicensePayment), checkFn = useServerFn(checkLicensePayment);
  const [auto, setAuto] = useState(false);
  const [doc, setDoc] = useState("");
  const [payId, setPayId] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);
  useEffect(() => { plansFn().then(p => setPlans(p.filter(x => x.active))).catch(e => setMsg(e.message)); modeFn().then(m => setAuto(m.automatic)).catch(() => {}); }, []);
  useEffect(() => {
    if (!payId) return;
    const t = setInterval(() => { checkFn({ data: { id: payId } }).then(r => { if (r.paid) { setPaid(true); clearInterval(t); setTimeout(() => window.location.reload(), 1500); } }).catch(() => {}); }, 5000);
    return () => clearInterval(t);
  }, [payId]);

  async function choose(plan: Plan) {
    setMsg("");
    try {
      if (auto) {
        if (!doc.trim()) { setMsg("Informe seu CPF ou CNPJ."); return; }
        const r = await autoFn({ data: { planId: plan.id, cpfCnpj: doc } });
        setQr({ img: r.image, code: r.payload, plan }); setPayId(r.id); return;
      }
      const pay = await payFn({ data: { planId: plan.id } });
      const code = pixPayload(pay.amount, pay.txid);
      setQr({ img: await QRCode.toDataURL(code, { width: 240, margin: 1 }), code, plan });
    } catch (e) { setMsg((e as Error).message); }
  }

  if (qr) return <div className="space-y-3 text-left">
    <p className="text-center text-sm">Pague <b>{brl(qr.plan.price)}</b> — {qr.plan.name} ({qr.plan.days} dias)</p>
    <img src={qr.img} alt="QR Code Pix" className="mx-auto rounded border bg-card" />
    <div className="flex gap-2"><input readOnly value={qr.code} className="min-w-0 flex-1 rounded border bg-muted px-2 text-xs" />
      <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(qr.code)}><Copy />Copiar</Button></div>
    {paid ? <p className="text-center text-sm font-bold text-primary">Pagamento confirmado! Liberando o painel...</p>
      : <p className="text-xs text-muted-foreground">{payId ? "Aguardando o pagamento — o painel é liberado automaticamente assim que o Pix for confirmado." : "Após o pagamento, sua licença é liberada assim que o pagamento for confirmado."}</p>}
    <Button variant="ghost" size="sm" onClick={() => { setQr(null); setPayId(null); }}>Escolher outro plano</Button>
  </div>;

  return <div className="space-y-2">
    {msg && <p className="text-sm text-destructive">{msg}</p>}
    {auto && <input value={doc} onChange={e => setDoc(e.target.value)} placeholder="Seu CPF ou CNPJ" className="w-full rounded-md border bg-background px-3 py-2 text-sm" />}
    {plans.map(p => <button key={p.id} type="button" onClick={() => choose(p)} className="flex w-full items-center justify-between rounded-lg border p-3 text-left hover:border-primary">
      <span><b>{p.name}</b><span className="block text-xs text-muted-foreground">{p.days} dias</span></span><span className="font-bold text-primary">{brl(p.price)}</span>
    </button>)}
    {!plans.length && !msg && <p className="text-sm text-muted-foreground">Nenhum plano disponível.</p>}
  </div>;
}
