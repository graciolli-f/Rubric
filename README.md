# Rubric

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/your-username/rubric/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

A constraint-driven language for enforcing clean architecture in JavaScript/TypeScript projects.

https://rubric.midspiral.com


## How to Use
Note: Rubric is currently only set up to work in the **Cursor IDE** since it relies heavily on the `.cursorrules` file to drive the workflow and process necessary to incorporate Rubric into the code generation. 

### The Rubric set up consists of two parts
- `rubric/` folder in project root: This is a folder that contains all Rubric-related reference files (found in this repo) needed for the LLM to properly incorporate Rubric into its code generation process
- `.cursorrules` file in project root: This file contains very specific instructions for an LLM working inside of Cursor on how to incorporate Rubric into its workflow

### Rubric set up in your project directory

```
your-project/
├── .cursorrules
├── rubric/
│   ├── ARCHITECTURE.yaml
│   ├── RUBRIC.md
|   ├── GlobalSpecs.rux
|   ├── DesignSystem.rux
│   ├── templates/
│   │   ├── container.rux.template
│   │   ├── data.rux.template
│   │   ├── guard.rux.template
│   │   ├── hook.rux.template
│   │   ├── presentation.rux.template
│   │   ├── provider.rux.template
│   │   ├── service.rux.template
│   │   ├── state.rux.template
│   │   └── utility.rux.template
│   └── validate.js
```

## What to expect

Once you have the `rubric/` folder and `.cursorrules` file in your project root, you can prompt AI as usual. 

After you prompt (for example, with a feature request), the AI will automatically begin the Rubric workflow: 
- Generate `.rux` files in a new directory `rubric/app`
- Automatically validate the `.rux` code with `node rubric/validate.js` command. If errors are found, it will automatically fix the errors. 
*Note: This requires that the agent has access to the terminal*
- Plan the code based on generated `.rux` constraints 
- Generate the code
- Validate the code against constraints by running validate command again
- Iterate based on validation failures
- Run through a checklist of common bugs listed in `rubric/RUBRIC.md` and create a `rubric/BUGS.md` file

## Notes
- Using Rubric in Cursor increases number of tokens used in a single request
- The `DesignSystem.rux` file is optional. The Rubric design system guides the LLM to create a tokens.css file as a source of truth for styling. If you have an established or preferred design system, you may choose to modify the file to fit your needs or remove it entirely. 

## Who's behind Rubric?
Rubric was created by [Fernanda Graciolli](https://github.com/graciolli-f) and is a product of [Midspiral](https://midspiral.com). Reach out with questions or comments to hello@midspiral.com.
