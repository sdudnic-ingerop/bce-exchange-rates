Project Constitution and Agent Run Policy

Purpose
- This document records the project's operational conventions and the behavior expected from maintenance agents and contributors when running the application locally or preparing deployments.

Agent behavior (human + automated)
- Agents and contributors must prefer reproducible, local development steps using Docker Compose when working on this project.
- Changes that affect runtime behavior should be tested locally with the exact commands below before being pushed.
- Agents should avoid making breaking changes to the public API without versioning and documenting them.

Local Docker Run Policy
- Use Docker Compose for local testing. It launches two services:
  - Streamlit UI on port 8501
  - FastAPI API on port 8000
- Commands to run locally:

```powershell
# Build and run both services (rebuild if needed)
docker-compose up --build

# Stop services
docker-compose down
```

- Health checks:
  - Streamlit UI: http://localhost:8501
  - FastAPI Health: http://localhost:8000/api/health
  - API Example: http://localhost:8000/api/bce-exchange?currencies=USD,CHF

Testing and validation
- After making code changes, run the API and exercise important endpoints, for example:

```powershell
# Health check
 curl "http://localhost:8000/api/health"

# Example API call
curl "http://localhost:8000/api/bce-exchange?currencies=USD,CHF"
```

- For UI checks, open the Streamlit UI and verify widgets and CSV export.

Commit and Push Guidelines
- Include concise commit messages.
- If a change affects external behavior (API shape, endpoints), update documentation files (`AGENTS.md`, `CONSTITUTION.md`, `SPEC.md`) and bump version or add migration notes.

Safety and Security
- Do not embed secrets or API keys in the repository.
- When exposing services publicly, use proper authentication and HTTPS configuration (out of scope for local Docker Compose).

Support
- For deployment instructions (Railway, Render), see DEPLOY.md and SPEC.md.

Acknowledgements
- This project uses ECB public data; respect their terms of use when scraping or using data.