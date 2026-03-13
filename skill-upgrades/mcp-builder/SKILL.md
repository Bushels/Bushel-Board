---
name: mcp-builder
description: "Build MCP (Model Context Protocol) servers that enable LLMs to interact with external services through well-designed tools. Use when the user says: 'build an MCP server', 'create an MCP tool', 'MCP integration', 'connect Claude to [service]', 'build a tool server', or asks to create a server that exposes API functionality to AI assistants via the Model Context Protocol. Also trigger for 'FastMCP', 'MCP SDK', 'tool server', or building bridges between LLMs and external APIs. Do NOT use for building regular REST APIs (not MCP), creating Claude skills or prompts (use skill-creator), general backend development, or building chatbots/agents that consume MCP tools (this skill is for building the server side)."
license: Complete terms in LICENSE.txt
---

# MCP Server Development Guide

Create MCP (Model Context Protocol) servers that enable LLMs to interact with external services through well-designed tools. Quality is measured by how well the server enables LLMs to accomplish real-world tasks.

## High-Level Workflow

### Phase 1: Deep Research and Planning

#### 1.1 Understand Modern MCP Design

- **API Coverage vs. Workflow Tools**: Balance comprehensive endpoint coverage with specialized workflow tools. When uncertain, prioritize comprehensive API coverage.
- **Tool Naming**: Use consistent prefixes and action-oriented names (e.g., `github_create_issue`, `github_list_repos`).
- **Context Management**: Return focused, relevant data. Support filtering and pagination.
- **Actionable Error Messages**: Guide agents toward solutions with specific suggestions.

#### 1.2 Study MCP Protocol Documentation

Start with the sitemap: `https://modelcontextprotocol.io/sitemap.xml`
Fetch pages with `.md` suffix for markdown (e.g., `https://modelcontextprotocol.io/specification/draft.md`).

#### 1.3 Study Framework Documentation

**Recommended stack**: TypeScript with Streamable HTTP (remote) or stdio (local).

Load reference docs as needed:
- [📋 MCP Best Practices](./reference/mcp_best_practices.md)
- [⚡ TypeScript Guide](./reference/node_mcp_server.md)
- [🐍 Python Guide](./reference/python_mcp_server.md)

For SDK docs, fetch:
- TypeScript: `https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md`
- Python: `https://raw.githubusercontent.com/modelcontextprotocol/python-sdk/main/README.md`

#### 1.4 Plan Implementation

Review the service's API docs. Identify endpoints, auth requirements, data models. Prioritize comprehensive coverage, starting with the most common operations.

### Phase 2: Implementation

#### 2.1 Project Structure
See language-specific guides for setup details.

#### 2.2 Core Infrastructure
Create: API client with auth, error handling helpers, response formatting (JSON/Markdown), pagination support.

#### 2.3 Implement Tools

For each tool, define:
- **Input Schema**: Zod (TS) or Pydantic (Python) with constraints and descriptions
- **Output Schema**: Define `outputSchema` where possible for structured data
- **Tool Description**: Concise summary with parameter descriptions and return type
- **Annotations**: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`

Implementation: async/await for I/O, actionable error handling, pagination support, both text and structured data in responses.

### Phase 3: Review and Test

- No duplicated code (DRY)
- Consistent error handling
- Full type coverage
- Clear tool descriptions
- Build verification: `npm run build` (TS) or `python -m py_compile` (Python)
- Test with MCP Inspector: `npx @modelcontextprotocol/inspector`

### Phase 4: Create Evaluations

Load [✅ Evaluation Guide](./reference/evaluation.md) for complete guidelines.

Create 10 evaluation questions that are: independent, read-only, complex (multi-tool), realistic, verifiable (single clear answer), and stable over time.

Output as XML:
```xml
<evaluation>
  <qa_pair>
    <question>Your complex question here</question>
    <answer>Verifiable answer</answer>
  </qa_pair>
</evaluation>
```

## Reference Files

| Resource | When to load | Path |
|----------|-------------|------|
| MCP Best Practices | Phase 1 | `./reference/mcp_best_practices.md` |
| TypeScript Guide | Phase 2 (TS) | `./reference/node_mcp_server.md` |
| Python Guide | Phase 2 (Python) | `./reference/python_mcp_server.md` |
| Evaluation Guide | Phase 4 | `./reference/evaluation.md` |
| MCP Protocol Spec | Phase 1 | Fetch from modelcontextprotocol.io |
| SDK READMEs | Phase 1-2 | Fetch from GitHub |

## Examples

**Example 1: GitHub integration**
User says: "Build an MCP server for GitHub"
→ Phase 1: Fetch GitHub API docs, plan tools for repos/issues/PRs/actions. Phase 2: TypeScript with Streamable HTTP, Zod schemas, tools like `github_list_repos`, `github_create_issue`, `github_search_code`. Phase 3: Test with Inspector. Phase 4: 10 eval questions.

**Example 2: Database connector**
User says: "I want Claude to query my Postgres database"
→ Phase 1: Plan read-only tools for schema inspection and query execution. Phase 2: Python with FastMCP, parameterized queries to prevent injection, tools like `db_list_tables`, `db_describe_table`, `db_execute_query`. Phase 3: Verify with test DB.

## Common Issues

- **Tools not discovered**: Tool names and descriptions must be clear and action-oriented. Vague names like `doStuff` won't be found by agents.
- **Auth failures at runtime**: Test auth setup early. Most issues are missing env vars or incorrect token scopes.
- **Massive responses**: Paginate by default. Returning 10,000 rows crashes context windows. Return focused summaries with pagination controls.
- **TypeScript build errors**: Run `npm run build` early and often. Common issue is missing Zod imports or incorrect schema types.
- **Evaluation questions too simple**: "List all repos" is trivial. Good evals require multi-step reasoning: "Find the PR that fixed the auth bug reported in issue #42 and identify which test file was added."
