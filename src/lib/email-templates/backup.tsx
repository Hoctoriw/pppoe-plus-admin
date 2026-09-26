import * as React from 'react'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface BackupProps {
  date?: string
  counts?: Record<string, number>
  url?: string
  fileName?: string
}

function BackupEmail({ date = '', counts = {}, url = '#', fileName = 'backup.json' }: BackupProps) {
  return (
    <Html>
      <Head />
      <Preview>Backup do painel Nexora ISP — {date}</Preview>
      <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }}>
        <Container style={{ padding: '24px', maxWidth: '640px' }}>
          <Heading style={{ fontSize: '20px', color: '#111' }}>Backup das configurações</Heading>
          <Text style={{ color: '#333' }}>Gerado em {date}. Resumo:</Text>
          <Section>
            {Object.entries(counts).map(([k, v]) => (
              <Text key={k} style={{ margin: '2px 0', color: '#333' }}>• {k}: {v}</Text>
            ))}
          </Section>
          <Section style={{ margin: '20px 0' }}>
            <Button href={url} style={{ backgroundColor: '#111', color: '#ffffff', padding: '12px 20px', borderRadius: '6px', fontSize: '14px' }}>
              Baixar arquivo {fileName}
            </Button>
          </Section>
          <Text style={{ color: '#555', fontSize: '13px' }}>
            O link fica válido por 30 dias. Baixe o arquivo e guarde em local seguro. Para restaurar, use a página Backup do painel e escolha este arquivo.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: BackupEmail,
  subject: (d: Record<string, any>) => `Backup do painel — ${d['date'] ?? ''}`,
  displayName: 'Backup das configurações',
  previewData: { date: '26/09/2026 11:00', counts: { Clientes: 2, Planos: 1 }, url: 'https://example.com', fileName: 'backup-nexora.json' },
} satisfies TemplateEntry
