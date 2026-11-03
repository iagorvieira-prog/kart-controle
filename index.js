const http = require("http");
const { WebSocketServer } = require("ws");

const server = http.createServer();
const wss = new WebSocketServer({ server });

let godot = null;

wss.on("connection", (ws) => {
    console.log("Cliente conectado");

    ws.on("message", (message) => {
        let data;

        try {
            data = JSON.parse(message.toString());
        } catch (error) {
            console.log("Mensagem inválida");
            return;
        }

        // Identificação do Godot
        if (data.type === "register" && data.role === "godot") {
            godot = ws;
            console.log("Godot conectado!");
            return;
        }

        // Recebe os controles do HTML
        if (data.type === "input") {
            const controls = {
                type: "input",
                steer: Number(data.steer) || 0,
                gas: Number(data.gas) || 0,
                brake: Number(data.brake) || 0
            };

            console.log("Controles:", controls);

            // Encaminha para o Godot
            if (godot && godot.readyState === 1) {
                godot.send(JSON.stringify(controls));
            }
        }
    });

    ws.on("close", () => {
        if (godot === ws) {
            godot = null;
            console.log("Godot desconectado!");
        }

        console.log("Cliente desconectado");
    });
});

server.listen(8080, () => {
    console.log("WebSocket rodando em ws://localhost:8080");
});