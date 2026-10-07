import { ArrowDown, ArrowRight, Cable, Anchor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FIBER_COLORS, fiberColor, fiberLabel } from "@/lib/fiber-colors";
import type { FtthNode } from "@/lib/ftth";

export function FiberSwatch({ number }: { number: number }) {
  return <span aria-hidden="true" className={`fiber-swatch ${fiberColor(number).className}`} />;
}

export function FiberConnections({ node, nodes, onSelect }: { node: FtthNode; nodes: FtthNode[]; onSelect: (id: string) => void }) {
  const parent = nodes.find((item) => item.id === node.parent_id);
  const children = nodes.filter((item) => item.parent_id === node.id).sort((a, b) => a.cable_fiber_number - b.cable_fiber_number || a.name.localeCompare(b.name));
  return <section className="space-y-3 border-t pt-4" aria-label={`Diagrama de ligações de ${node.name}`}>
    <h2 className="flex items-center gap-2 font-semibold"><Cable className="h-4 w-4" />Ligações de fibra</h2>
    {parent && <div className="space-y-1 text-xs">
      <p className="break-words text-muted-foreground">Entrada de {parent.name}</p>
      <p className="flex flex-wrap items-center gap-2"><FiberSwatch number={node.cable_fiber_number} /><span>{fiberLabel(node.cable_fiber_number)}</span></p>
      <ArrowDown className="h-4 w-4 text-muted-foreground" />
    </div>}
    <p className="break-words font-semibold">{node.name}{node.splitter_type === "balanced" && node.splitter_ratio > 1 ? ` · splitter 1:${node.splitter_ratio}` : node.splitter_type === "unbalanced" ? ` · ${node.splitter_tap}/${100 - node.splitter_tap}` : ""}</p>
    {children.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma caixa de saída ligada.</p> : <ul className="divide-y">
      {children.map((child) => <li key={child.id} className="py-2">
        <Button type="button" variant="ghost" className="h-auto w-full justify-start whitespace-normal px-1 py-2 text-left" onClick={() => onSelect(child.id)} aria-label={`Abrir ligação de ${child.name}`}>
          <FiberSwatch number={child.cable_fiber_number} />
          <span className="min-w-0 flex-1 text-xs">
            <span className="block">{fiberLabel(child.cable_fiber_number)}</span>
            <span className="mt-1 block break-words font-semibold">Conectada a {child.name}</span>
            <span className="mt-1 block font-normal text-muted-foreground">{node.splitter_type === "unbalanced" ? `Passagem ${100 - node.splitter_tap}%` : node.splitter_ratio > 1 ? child.parent_port ? `Porta ${child.parent_port} do splitter` : "Porta do splitter não definida" : "Emenda direta"} · cabo {child.cable_fibers ?? "—"} fibras</span>
          </span><ArrowRight className="h-4 w-4 text-muted-foreground" />
        </Button>
      </li>)}
    </ul>}
    <p className="text-xs text-muted-foreground">Referência brasileira de cores. Confirme tubo, cor e sentido do cabo antes da fusão; as ligações mostram o cadastro, não a verificação em campo.</p>
  </section>;
}

export function FiberReference() {
  return <section className="mt-6 border-t pt-5" aria-labelledby="fiber-reference-title">
    <h2 id="fiber-reference-title" className="flex items-center gap-2 text-lg font-bold"><Cable className="h-5 w-5" />Cores das fibras · backbone</h2>
    <p className="mt-1 text-sm text-muted-foreground">Sequência brasileira de 12 cores — confirme o padrão na ficha do fabricante.</p>
    <ol className="mt-4 grid grid-cols-2 gap-x-4 sm:grid-cols-3 xl:grid-cols-6">
      {FIBER_COLORS.map((color, index) => <li key={color.name} className="flex items-center gap-2 border-b py-3 text-sm"><FiberSwatch number={index + 1} /><span><span className="font-mono font-semibold">{index + 1}</span> · {color.name}</span></li>)}
    </ol>
    <p className="mt-3 text-xs text-muted-foreground">Acima de 12 fibras, a sequência se repete em grupos. Identifique também o tubo e suas marcações conforme o fabricante; a cor sozinha não identifica a fibra.</p>
    <div className="mt-5 border-t pt-4">
      <h3 className="flex items-center gap-2 font-semibold"><Anchor className="h-4 w-4" />Ancoragem e travessias</h3>
      <ul className="mt-3 grid gap-3 text-sm md:grid-cols-2">
        <li><strong>Travessia de rua:</strong> prever ancoragem mecânica nos dois lados, conforme projeto e ferragens do cabo. Conferir altura livre, autorização e regras da concessionária.</li>
        <li><strong>Esquinas e mudanças de direção:</strong> prever ancoragem adequada para aliviar a tração. Nunca usar a CEO ou a CTO como ponto de sustentação do cabo.</li>
        <li><strong>A cada quantos metros?</strong> Apoie o cabo em cada poste; o vão máximo e o intervalo de ancoragem dependem do cabo, vento e projeto. Ex.: cabo especificado para vão de 80 m não deve ultrapassar 80 m entre apoios.</li>
        <li><strong>Reserva no backbone:</strong> referência de 20–30 m a cada 500–800 m e antes de travessias críticas. Reserva técnica não substitui ancoragem mecânica.</li>
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">Os pontos no mapa registram o trajeto; dimensionamento de esforço, ferragens e raio mínimo de curvatura seguem a ficha do cabo e o responsável técnico.</p>
    </div>
  </section>;
}