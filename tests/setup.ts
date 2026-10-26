process.env.DATABASE_URL = ':memory:';
process.env.LLM_MOCK = '1';
delete process.env.ANTHROPIC_API_KEY;
