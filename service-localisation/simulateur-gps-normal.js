const grpc = require("@grpc/grpc-js");
const protoLoader = require("@grpc/proto-loader");
const path = require("path");

const protoPath = path.join(__dirname, "gps.proto");
const packageDef = protoLoader.loadSync(protoPath, {
  keepCase: true,
  longs: String,
  defaults: true,
});
const proto = grpc.loadPackageDefinition(packageDef).gps;

const client = new proto.LocalisationService(
  "localhost:50051",
  grpc.credentials.createInsecure()
);

const stream = client.StreamPositions();

stream.on("data", (ack) => {
  console.log("ACK:", ack);
});

stream.on("error", (err) => {
  console.error("Erreur stream:", err.message);
});

stream.on("end", () => {
  console.log("Stream terminé");
});

const vehiculeId = 1;
const baseLat = 49.45;
const baseLon = 0.12;

let i = 0;
const interval = setInterval(() => {
  i++;

  const position = {
    vehicule_id: vehiculeId,
    latitude: baseLat + i * 0.001,
    longitude: baseLon + i * 0.001,
    vitesse: 40 + i,
    timestamp: new Date().toISOString(),
  };

  console.log("SEND:", position);
  stream.write(position);

  if (i >= 10) {
    clearInterval(interval);
    stream.end();
  }
}, 800);