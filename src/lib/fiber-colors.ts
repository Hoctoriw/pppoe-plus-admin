/** Referência brasileira de 12 cores; confirmar sempre a ficha técnica do cabo. */
export const FIBER_COLORS = [
  { name: "Verde", className: "fiber-green" },
  { name: "Amarela", className: "fiber-yellow" },
  { name: "Branca", className: "fiber-white" },
  { name: "Azul", className: "fiber-blue" },
  { name: "Vermelha", className: "fiber-red" },
  { name: "Violeta", className: "fiber-violet" },
  { name: "Marrom", className: "fiber-brown" },
  { name: "Rosa", className: "fiber-pink" },
  { name: "Preta", className: "fiber-black" },
  { name: "Cinza", className: "fiber-gray" },
  { name: "Laranja", className: "fiber-orange" },
  { name: "Aqua", className: "fiber-aqua" },
] as const;

export function fiberColor(number: number) {
  const safe = Number.isFinite(number) ? Math.max(1, Math.floor(number)) : 1;
  return { ...(FIBER_COLORS[(safe - 1) % 12] ?? FIBER_COLORS[0]), group: Math.ceil(safe / 12) };
}

export function fiberLabel(number: number) {
  const color = fiberColor(number);
  return `Fibra ${number} · ${color.name}${color.group > 1 ? ` · grupo ${color.group}` : ""}`;
}