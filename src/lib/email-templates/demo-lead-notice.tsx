import React from 'react'
import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props { name?: string; company?: string; whatsapp?: string; email?: string; size?: string }

const Email = ({ name, company, whatsapp, email, size }: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Novo pedido de demonstração</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={{ fontSize: '20px' }}>Novo pedido de demonstração</Heading>
        <Text>Nome: {name || '-'}<br />Provedor: {company || '-'}<br />WhatsApp: {whatsapp || '-'}<br />E-mail: {email || '-'}<br />Clientes: {size || '-'}</Text>
        <Text style={{ color: '#777777', fontSize: '13px' }}>Veja todos em Usuários → Leads no painel.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Record<string, any>) => `Novo lead: ${d.company ?? 'provedor'}`,
  displayName: 'Aviso de novo lead',
  previewData: { name: 'Carlos', company: 'NetFibra', whatsapp: '11999999999', email: 'c@x.com', size: 'até 200' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px' }
