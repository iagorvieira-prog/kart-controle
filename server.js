const path = require('path');
const os = require('os');
const http = require('http');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');

// Local: 8080 | Hospedado: a plataforma define a porta em process.env.PORT
const PORT = process.env.PORT || 8080;
const DEBUG = process.env.DEBUG === '1';

// Estado compartilhado
let godot = null; // conexão do Godot (só uma)
const controllers = new Set(); // conexões de celulares

const app = express();

// ===== ROTAS HTTP =====
// Página do controle (o celular abre este endereço)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Verificação de saúde (útil na hospedagem e pra testar no navegador)
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    godot: godot !== null && godot.readyState === WebSocket.OPEN,
    controllers: controllers.size,
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ===== ETAPA 1: receber do celular =====
// (acontece no wss.on("message") abaixo)

// ===== ETAPA 2: transformar os valores =====
// Garante números válidos e dentro do intervalo esperado pelo Godot
function normalizar(data) {
  const limitar = (valor, min, max) =>
    Math.max(min, Math.min(max, Number(valor) || 0));

  return {
    type: 'input',
    steer: limitar(data.steer, -1, 1),
    gas: limitar(data.gas, 0, 1),
    brake: limitar(data.brake, 0, 1),
  };
}

// ===== ETAPA 3: levar até o Godot =====
function enviarParaGodot(controls) {
  if (godot && godot.readyState === WebSocket.OPEN) {
    godot.send(JSON.stringify(controls));
  }
}

wss.on('connection', (ws) => {
  console.log('Cliente conectado');

  // Heartbeat: evita que proxies de hospedagem derrubem conexões paradas
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('error', (erro) => {
    console.log('Erro no socket:', erro.message);
  });

  ws.on('message', (message) => {
    let data;

    try {
      data = JSON.parse(message.toString());
    } catch (error) {
      console.log('Mensagem inválida');
      return;
    }

    // Identificação do Godot
    if (data.type === 'register' && data.role === 'godot') {
      godot = ws;
      console.log('Godot conectado!');
      return;
    }

    // Controles vindos do celular
    if (data.type === 'input') {
      if (ws === godot) return; // o Godot não manda controles

      controllers.add(ws);

      const controls = normalizar(data);

      if (DEBUG) console.log('Controles:', controls);

      enviarParaGodot(controls);
    }
  });

  ws.on('close', () => {
    if (godot === ws) {
      godot = null;
      console.log('Godot desconectado!');
    }

    // Se o último celular saiu, zera os controles no Godot
    // (senão o kart fica acelerando com o último valor recebido)
    if (controllers.delete(ws) && controllers.size === 0) {
      enviarParaGodot(normalizar({}));
      console.log('Celular desconectado, controles zerados');
    }

    console.log('Cliente desconectado');
  });
});

// Ping a cada 25 s; quem não responder é derrubado
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 25000);

wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`  Godot (local):  ws://127.0.0.1:${PORT}`);

  for (const lista of Object.values(os.networkInterfaces())) {
    for (const item of lista || []) {
      if (item.family === 'IPv4' && !item.internal) {
        console.log(
          `  Celular (mesma rede Wi-Fi): http://${item.address}:${PORT}`,
        );
      }
    }
  }
});
