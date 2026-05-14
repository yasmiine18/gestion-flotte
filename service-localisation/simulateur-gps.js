const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");

const protoPath = path.join(__dirname, "gps.proto");
const packageDef = protoLoader.loadSync(protoPath, {
  keepCase: true, longs: String, defaults: true,
});
const proto = grpc.loadPackageDefinition(packageDef).gps;
const client = new proto.LocalisationService("localhost:50051", grpc.credentials.createInsecure());
const stream = client.StreamPositions();

stream.on("data", (ack) => { console.log("ACK:", ack); });
stream.on("error", (err) => { console.error("Erreur stream:", err.message); });
stream.on("end", () => { console.log("Stream terminé — 10 positions envoyées hors zone"); });

const vehiculeId = 1;

// Positions hors zone Rouen (zone = 49.4→49.55, 0.05→0.25)
// On part de Évreux vers le nord — hors zone geofencing
const baseLat = 48.90;
const baseLon = 0.30;

let i = 0;
const interval = setInterval(() => {
  i++;
  const position = {
    vehicule_id: vehiculeId,
    latitude: parseFloat((baseLat + i * 0.015).toFixed(4)),
    longitude: parseFloat((baseLon + i * 0.012).toFixed(4)),
    vitesse: 70 + i * 2,
    timestamp: new Date().toISOString(),
  };
  console.log("SEND:", position);
  stream.write(position);
  if (i >= 10) {
    clearInterval(interval);
    stream.end();
  }
}, 800);
