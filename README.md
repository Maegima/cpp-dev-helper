# C++ Development Helper

A simple Visual Studio Code extension designed to streamline C++ development by generating function implementations in a `.cpp` file from the corresponding `.hpp` header file. This extension assists with common C++ tasks, like generating function implementations, improving productivity, and reducing boilerplate code.

## Features

- **Generate all implementations**: Automatically generates function implementations in the corresponding `.cpp` file for all functions declared in the `.hpp` file.
- **Generate a single implementation**: Generate a specific function implementation at the cursor's location in the `.hpp` file.
- **Automatic class name detection**: The extension detects the class name from the `.hpp` file to properly scope function implementations.
- **Formating**: The extension can automatically format generated code using: clang-format (in-place). Uses clang-format if available, custom spacing cleanup for + - * / operators outside of strings.
- **Output Logging**: All formatting operations and diagnostics are logged to the C++ Dev Helper output channel.

| Command | Description |
|---|---|
| `cpp-dev-helper.generateImplementation`       | Generate all implementations from the active header. |
| `cpp-dev-helper.generateSingleImplementation` | Generate just the implementation at cursor.          |


## Usage

### Generate Implementations for All Functions
- Open your `.hpp` file in VS Code.
- Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS).
- Type **C++: Generate Implementation in CPP file** and select it.

This will automatically generate function implementations in the corresponding `.cpp` file for all the functions declared in your `.hpp` file.

### Generate a Single Implementation
- Open your `.hpp` file.
- Place the cursor on the function declaration for which you want to generate an implementation.
- Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS).
- Type **C++: Generate Single Implementation at Cursor** and select it.

The function implementation will be inserted at the appropriate location in the `.cpp` file.

### Context Menu
You can also access the generation commands directly from the context menu by right-clicking in the `.hpp` file. Options for both generating all and generating a single implementation will appear if you right-click on function declarations.

## Configuration
The extension works out of the box, but can be customized via settings:

| Setting | Default | Description |
|---|---|---|
| `cpp-dev-helper.enableClangFormat`                 | `true`  | Enables or disables clang-format auto-formatting. |

Formatting Behavior
- Looks for .clang-format only at the project root
- If found -> used automatically
- If not found -> falls back to LLVM style
- Always runs clang-format in-place on the .cpp file
- Applies custom operator spacing cleanup afterward

## Example

Given the following class definition in `MyClass.hpp`:

```cpp
class MyClass {
public:
    MyClass();
    void doSomething(int a, int b);
};
```

After running C++: Generate Implementation in CPP file, the following code will be added to MyClass.cpp:

```cpp
#include "MyClass.hpp"

MyClass::MyClass() {
    // Constructor implementation
}

void MyClass::doSomething(int a, int b) {
    // Function implementation
}

```

## Development

### Prerequisites

To develop or contribute to this extension, you need:

- Node.js
- VS Code (with the **VS Code Extension API**)

### Running the Extension Locally

1. Clone the repository.
2. Navigate to the project folder in your terminal.
3. Run `npm install` to install the dependencies.
4. Run `npm run watch` to compile TypeScript and watch for changes.
5. Press `F5` in VS Code to open a new window with the extension loaded.

### Commands

- `cpp-dev-helper.generateImplementation`: Generates implementations for all functions in the header file.
- `cpp-dev-helper.generateSingleImplementation`: Generates a single function implementation at the cursor.

### Testing

To test the extension, run:
```bash
npm run test
```

### Linting

The code follows ESLint rules. To lint the code, run:
```bash
npm run lint
```

### Build

To compile the extension, run:
```bash
npm run compile
```

## License

This extension is licensed under the [MIT License](LICENSE).
