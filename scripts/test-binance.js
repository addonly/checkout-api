/**
 * Teste de conectividade Binance Gift Card API
 * Corre: node scripts/test-binance.js
 * 
 * Testa em ordem:
 *  1. RSA Public Key  → confirma autenticação
 *  2. Gift Card Verify → confirma USER_DATA
 */

const crypto = require('crypto');
require('dotenv').config();

const API_KEY    = process.env.BINANCE_API_KEY;
const API_SECRET = process.env.BINANCE_API_SECRET;
const BASE_URL   = process.env.BINANCE_API_BASE_URL || 'https://api.binance.com';
const RECV_WIN   = process.env.BINANCE_RECV_WINDOW  || 5000;

if (!API_KEY || !API_SECRET) {
  console.error('❌ BINANCE_API_KEY ou BINANCE_API_SECRET em falta no .env');
  process.exit(1);
}

function sign(params) {
  return crypto.createHmac('sha256', API_SECRET).update(params).digest('hex');
}

async function get(path, extraParams = '') {
  const ts     = Date.now();
  const params = `timestamp=${ts}&recvWindow=${RECV_WIN}${extraParams ? '&' + extraParams : ''}`;
  const sig    = sign(params);
  const url    = `${BASE_URL}${path}?${params}&signature=${sig}`;

  const res = await fetch(url, {
    headers: { 'X-MBX-APIKEY': API_KEY },
  });

  const json = await res.json();
  return { status: res.status, data: json };
}

async function run() {
  console.log('\n🔑 Binance Gift Card API — Teste de Conectividade');
  console.log('='.repeat(50));
  console.log(`API Key: ${API_KEY.slice(0, 8)}...`);
  console.log(`Base URL: ${BASE_URL}\n`);

  // ── Teste 1: RSA Public Key ──────────────────────────
  console.log('📋 Teste 1: GET /sapi/v1/giftcard/cryptography/rsa-public-key');
  try {
    const { status, data } = await get('/sapi/v1/giftcard/cryptography/rsa-public-key');
    if (data.success && data.data) {
      console.log(`✅ SUCESSO (HTTP ${status})`);
      console.log(`   RSA Key (primeiros 40 chars): ${String(data.data).slice(0, 40)}...`);
    } else {
      console.log(`❌ FALHOU (HTTP ${status}): ${JSON.stringify(data)}`);
    }
  } catch (err) {
    console.log(`❌ ERRO: ${err.message}`);
  }

  // ── Teste 2: Gift Card Verify (número fictício) ──────
  console.log('\n📋 Teste 2: GET /sapi/v1/giftcard/verify (referenceNo fictício)');
  console.log('   (esperado: valid=false ou erro — não é um cartão real)');
  try {
    const { status, data } = await get('/sapi/v1/giftcard/verify', 'referenceNo=1234567890123456');
    if (status === 200) {
      console.log(`✅ ENDPOINT RESPONDEU (HTTP ${status})`);
      console.log(`   valid: ${data.data?.valid}`);
      console.log(`   message: ${data.message}`);
    } else {
      console.log(`⚠️  HTTP ${status}: ${JSON.stringify(data)}`);
      if (status === 401 || data.code === '-2015') {
        console.log('   → API Key inválida ou sem permissão');
      }
    }
  } catch (err) {
    console.log(`❌ ERRO: ${err.message}`);
  }

  console.log('\n' + '='.repeat(50));
  console.log('Testes concluídos.');
  console.log('Se ambos responderam → autenticação OK → podes avançar para o redeemCode real.\n');
}

run();
