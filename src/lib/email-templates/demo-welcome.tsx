import React from 'react'
import { Body, Button, Container, Head, Heading, Html, Img, Link, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props { name?: string; company?: string }

const Email = ({ name, company }: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Sua demonstração do Syncron ISP e 30 dias grátis</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://rede.syncrontelecom.com/syncron-logo.png" width="56" height="56" alt="Syncron ISP" />
        <Heading style={h1}>{name ? `Olá, ${name}!` : 'Olá!'}</Heading>
        <Text style={text}>Obrigado pelo interesse{company ? ` da ${company}` : ''} no Syncron ISP. Veja o sistema funcionando nos vídeos abaixo:</Text>
        <Text style={text}>▶ <Link href="https://youtu.be/tEV1xSw6jRE">Apresentação completa</Link><br />▶ <Link href="https://youtube.com/shorts/-994Wb7skP8">Resumo em 15 segundos</Link></Text>
        <Text style={text}>Mapa FTTH, MikroTik sem IP público (Syncron Bridge), RADIUS, boletos e Pix com baixa automática — tudo em um só painel.</Text>
        <Button href="https://rede.syncrontelecom.com/auth" style={button}>Testar grátis por 30 dias</Button>
        <Text style={muted}>Em breve nossa equipe entra em contato pelo WhatsApp informado.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Sua demonstração do Syncron ISP',
  displayName: 'Demonstração solicitada',
  previewData: { name: 'Carlos', company: 'NetFibra' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', color: '#0b2545' }
const text = { fontSize: '15px', lineHeight: '24px', color: '#333333' }
const muted = { fontSize: '13px', color: '#777777', marginTop: '20px' }
const button = { backgroundColor: '#f97316', color: '#ffffff', padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', textDecoration: 'none' }
