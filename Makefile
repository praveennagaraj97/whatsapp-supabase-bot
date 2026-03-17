.PHONY: help install seed seed-doctors seed-clinics seed-medicines seed-faqs deploy serve serve-admin secrets deploy-webhook deploy-admin

# Default Supabase project ref (override with SUPABASE_PROJECT_REF=xxx)
SUPABASE_PROJECT_REF ?= qfuovdkaygjlwqqcqmxm

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install Node.js dependencies
	yarn install

seed: install ## Seed all CSV data into Supabase
	yarn seed

serve: ## Run webhook edge function locally with Deno
	yarn serve

serve-admin: ## Run admin edge function locally with Deno
	yarn serve:admin

secrets: ## Push secrets from .env to Supabase edge functions
	yarn secrets

deploy-webhook: ## Deploy webhook edge function to Supabase
	@# Ensure SUPABASE_ACCESS_TOKEN is available: prefer env, fallback to .env file
	@if [ -z "$$SUPABASE_ACCESS_TOKEN" ]; then \
		if [ -f .env ]; then \
			SUPABASE_ACCESS_TOKEN="$$(grep -E '^SUPABASE_ACCESS_TOKEN=' .env | cut -d'=' -f2-)"; \
		fi; \
	fi; \
	SUPABASE_ACCESS_TOKEN="$$SUPABASE_ACCESS_TOKEN" npx supabase functions deploy webhook --project-ref $(SUPABASE_PROJECT_REF) --no-verify-jwt

deploy-admin: ## Deploy admin edge function to Supabase
	@# Ensure SUPABASE_ACCESS_TOKEN is available: prefer env, fallback to .env file
	@if [ -z "$$SUPABASE_ACCESS_TOKEN" ]; then \
		if [ -f .env ]; then \
			SUPABASE_ACCESS_TOKEN="$$(grep -E '^SUPABASE_ACCESS_TOKEN=' .env | cut -d'=' -f2-)"; \
		fi; \
	fi; \
	SUPABASE_ACCESS_TOKEN="$$SUPABASE_ACCESS_TOKEN" npx supabase functions deploy admin --project-ref $(SUPABASE_PROJECT_REF) --no-verify-jwt

deploy: secrets deploy-webhook deploy-admin ## Push secrets and deploy all edge functions
	@echo "Webhook and admin functions deployed!"
