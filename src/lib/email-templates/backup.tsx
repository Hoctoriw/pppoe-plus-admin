import * as React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface BackupProps {
  date?: string
  counts?: Record<string, number>
  json?: string
}

function BackupEmail({ date = '', counts = {}, json = '{}' }: BackupProps) {
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
          <Text style={{ color: '#333' }}>Dados completos (JSON) abaixo. Guarde este e-mail em local seguro.</Text>
          <pre style={{ fontSize: '11px', background: '#f4f4f5', padding: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{json}</pre>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: BackupEmail,
  subject: (d: Record<string, any>) => `Backup do painel — ${d['date'] ?? ''}`,
  displayName: 'Backup das configurações',
  previewData: { date: '26/09/2026 11:00', counts: { Clientes: 2, Planos: 1 }, json: '{"plans":[]}' },
} satisfies TemplateEntry
