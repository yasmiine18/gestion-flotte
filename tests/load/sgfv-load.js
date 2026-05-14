import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 10,
  duration: "30s",
};

export default function () {
  const endpoints = [
    "http://localhost:8081/vehicules",
    "http://localhost:8082/conducteurs",
    "http://localhost:8084/maintenances",
    "http://localhost:8083/localisations/vehicule/1",
    "http://localhost:8086/evenements",
    "http://localhost:4000/graphql"
  ];

  const url = endpoints[Math.floor(Math.random() * endpoints.length)];

  let res;
  if (url.endsWith("/graphql")) {
    res = http.post(
      url,
      JSON.stringify({
        query: `query {
          dernierePosition(vehiculeId: 1) {
            latitude
            longitude
            timestamp
          }
        }`
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } else {
    res = http.get(url);
  }

  check(res, {
    "status is 2xx or 4xx acceptable": (r) => r.status >= 200 && r.status < 500,
  });

  sleep(1);
}