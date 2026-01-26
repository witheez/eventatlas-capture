# Contributing to EventAtlas Capture

Thank you for your interest in contributing to EventAtlas Capture! This document provides guidelines and instructions for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/eventatlas-capture.git
   cd eventatlas-capture
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a branch for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Setup

### Prerequisites

- Node.js 18 or higher
- npm or pnpm
- Chrome browser for testing

### Running the Development Server

```bash
npm run dev
```

This will:
- Start a Vite dev server with hot module replacement (HMR)
- Open a new Chrome window with the extension loaded
- Automatically reload on file changes

### Running Tests

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Code Quality

We use ESLint and Prettier to maintain code quality. Pre-commit hooks are configured to automatically lint and format staged files.

```bash
# Run linter
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

## Pull Request Process

1. Ensure your code passes all tests:
   ```bash
   npm run test
   ```

2. Ensure your code passes linting:
   ```bash
   npm run lint
   ```

3. Ensure the build succeeds:
   ```bash
   npm run build
   ```

4. Update documentation if you've added new features or changed behavior

5. Create a pull request with a clear title and description

## Code Style Guidelines

- Use TypeScript for all new code
- Use Preact for UI components (`.tsx` files)
- Follow the existing code patterns and naming conventions
- Write meaningful commit messages
- Add tests for new functionality
- Keep components small and focused

## Project Structure

```
entrypoints/
  background.ts      # Service worker
  content.ts         # Content script
  sidepanel/
    components/      # Preact components
    main.ts          # Main orchestrator
    store.ts         # State management
    ...
utils/               # Shared utilities
```

## Reporting Issues

When reporting issues, please include:
- A clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Browser version
- Any relevant error messages or screenshots

## Questions?

If you have questions about contributing, feel free to open an issue for discussion.
