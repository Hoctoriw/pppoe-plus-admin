// Verificação de licença no servidor (não confiar apenas no LicenseGate do navegador).
export async function assertLicensed(supabase: any) {
  const { data, error } = await supabase.rpc("my_license");
  if (error) throw new Error("Não foi possível verificar a licença.");
  if (!(data as any)?.valid) throw new Error("Licença expirada. Renove na aba Licença para continuar.");
}
