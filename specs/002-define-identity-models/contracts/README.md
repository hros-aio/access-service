# Contracts: Identity Models

No external interface contracts (e.g. REST APIs, public controller routes, Kafka event consumer schemas) are introduced in this feature. This feature strictly implements the internal persistence layer (TypeORM entities and repositories) based on the pre-defined PostgreSQL schema.

Validation of this layer is performed via internal repository integration tests and NestJS injection testing, as documented in `quickstart.md`.
