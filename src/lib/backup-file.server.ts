// Salva o backup como arquivo .json no armazenamento privado e devolve um link de download temporário.
// O serviço de e-mail não suporta anexos, então o e-mail leva o link do arquivo.
export async function storeBackupFile(owner: string, json: string, now: Date): Promise<{ url: string; fileName: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const fileName = `backup-nexora-${stamp}.json`;
  const path = `${owner}/${fileName}`;
  const { error } = await supabaseAdmin.storage.from("backups").upload(path, new Blob([json], { type: "application/json" }), {
    contentType: "application/json",
    upsert: true,
  });
  if (error) throw new Error(`Erro ao salvar arquivo de backup: ${error.message}`);
  const { data, error: e2 } = await supabaseAdmin.storage.from("backups").createSignedUrl(path, 60 * 60 * 24 * 30, { download: fileName });
  if (e2 || !data) throw new Error(`Erro ao gerar link do backup: ${e2?.message}`);
  return { url: data.signedUrl, fileName };
}
