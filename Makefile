.PHONY: up down migrate generate push-schema studio dev test

up:
	docker compose up -d

down:
	docker compose down

migrate:
	npm run db:migrate

generate:
	npm run db:generate

push-schema:
	npm run db:push

studio:
	npm run db:studio

dev:
	concurrently "npm run dev:api" "npm run dev:worker" "npm run dev:web"

test:
	npm test

test-integration:
	npm run test:integration

install:
	npm install
