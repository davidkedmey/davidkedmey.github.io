# Dawkins' Biomorphs

A faithful implementation of Richard Dawkins' biomorphs from **"The Evolution of Evolvability"** (1988), originally described in *The Blind Watchmaker* (1986).

## The Algorithm

Each biomorph has a **genotype of 9 integer genes**:

- **g1–g8** (range −3 to 3): Define 8 two-dimensional direction vectors
- **g9** (range 1 to 8): Controls recursion depth (developmental stages)

### DefineVectors

The first 8 genes map to 8 vectors with built-in bilateral symmetry:

| Vector | dx   | dy  |
|--------|------|-----|
| v1     | −g3  | g7  |
| v2     | −g2  | g6  |
| v3     | −g1  | g5  |
| v4     | 0    | g4  |
| v5     | g1   | g5  |
| v6     | g2   | g6  |
| v7     | g3   | g7  |
| v8     | 0    | g8  |

Note the symmetry: v1 mirrors v7, v2 mirrors v6, v3 mirrors v5.

### DrawBiomorph

```
procedure DrawBiomorph(i, c, x₀, y₀):
    if i = 0 then i ← 8
    if i = 9 then i ← 1
    (x₁, y₁) ← (x₀ + c·vᵢ.dx, y₀ + c·vᵢ.dy)
    draw line from (x₀, y₀) to (x₁, y₁)
    if c > 1:
        DrawBiomorph(i−1, c−1, x₁, y₁)
        DrawBiomorph(i+1, c−1, x₁, y₁)
```

Initial call: `DrawBiomorph(4, g9, 0, 0)`

### Mutation

A single gene changes by ±1 per generation, clamped to its valid range.

## How to Use

1. Open `index.html` in a browser
2. The parent biomorph is shown at the top with 8 mutant offspring below
3. Click any offspring to select it as the new parent
4. Repeat to evolve creatures through artificial selection

## References

- Dawkins, R. (1988). "The Evolution of Evolvability." In *Artificial Life* (ed. C. Langton), pp. 201–220.
- Dawkins, R. (1986). *The Blind Watchmaker*. Norton.
