# finos

## System Design (mermaid)

```mermaid
flowchart LR
    GUI[GUI (React/Vite)] -->|REST| APIGW[api-gateway (Fastify)]
    APIGW -->|gRPC| ERPX[erp-extractor]
    ERPX -->|REST| ERPSIM[erp-sim (SAP-like sim)]
    APIGW -->|gRPC| MKT[commodity-scraper]
    APIGW -->|gRPC| RISK[risk-engine]
    APIGW -->|gRPC| TRADE[trade-gateway]
    TRADE --> BROKER[broker-sim]
    ERPSIM -.->|events/poll| ERPX
    MKT --> DB[(Postgres)]
    ERPX --> DB
    RISK --> DB
    TRADE --> DB
    APIGW --> DB
    subgraph Observability
      LOG[Logstash/Elasticsearch/Kibana]
    end
    APIGW -. gelf .-> LOG
    ERPX -. gelf .-> LOG
    ERPSIM -. gelf .-> LOG
    MKT -. gelf .-> LOG
    TRADE -. gelf .-> LOG
    DB -. gelf .-> LOG
```
