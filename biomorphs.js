class Biomorph {
    constructor(canvas, genes = null) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.genes = genes || this.randomizeGenes();
        this.maxDepth = 6; // Limit recursion depth for performance
        this.draw(); // Draw immediately
        this.updateGeneFields(); // Update the gene input fields on the HTML
    }

    randomizeGenes() {
        let genes = [];
        for (let i = 0; i < 14; i++) {
            genes.push(i >= 7 && i <= 9 ? Math.floor(Math.random() * 106) + 150 : Math.floor(Math.random() * 21));
        }
        genes.push(...Array.from({ length: 3 }, () => Math.floor(Math.random() * 2))); // Symmetry genes
        genes.push(Math.floor(Math.random() * 5) + 1); // Number of segments (1-5)
        genes.push(Math.floor(Math.random() * 30) + 20); // Distance between segments (20-50)
        genes.push(Math.floor(Math.random() * 5)); // Depth gradient per segment
        genes.push(Math.floor(Math.random() * 5)); // Angle variation gradient per segment
        genes.push(Math.floor(Math.random() * 2)); // Alternating asymmetry (0 or 1)
        return genes;
    }

    mutateGenes() {
        const geneToMutate = Math.floor(Math.random() * this.genes.length);
        let mutationRange;
        switch (geneToMutate) {
            case 0: // Mutation logic for Depth gene
                mutationRange = 20;
                break;
            case 1: // Mutation logic for Angle Variation
                mutationRange = 180;
                break;
            case 17: // Mutation logic for Number of Segments
                mutationRange = 5;
                break;
            case 18: // Mutation logic for Distance Between Segments
                mutationRange = 30;
                break;
            default:
                mutationRange = 21; // Default case
        }
        this.genes[geneToMutate] = Math.floor(Math.random() * mutationRange);
        this.draw(); // Immediately draw the updated biomorph
        this.updateGeneFields();
    }

    updateGeneFields() {
        for (let i = 0; i < this.genes.length; i++) {
            let geneInput = document.getElementById(`gene${i}`);
            if (geneInput) {
                geneInput.value = this.genes[i];
            }
        }
    }

    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const [r, g, b] = this.genes.slice(7, 10);
        ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;

        let depth = Math.min(this.genes[0], this.maxDepth); // Limit depth
        let angleVariation = this.genes[1]; // Use raw angle in degrees
        let length = this.canvas.height / 10 + this.genes[2];
        let numberOfSegments = Math.min(this.genes[17], 5); // Limit number of segments
        let distanceBetweenSegments = this.genes[18];
        let depthGradient = this.genes[19];
        let numberOfBranches = this.genes[3]; // Number of branches per node

        const useVariableBranching = document.getElementById('toggleVariableBranching').checked;
        const useBilateralSymmetry = document.getElementById('toggleBilateralSymmetry').checked;
        const useUpDownSymmetry = document.getElementById('toggleUpDownSymmetry').checked;
        const useRadialSymmetry = document.getElementById('toggleRadialSymmetry').checked;

        for (let i = 0; i < numberOfSegments; i++) {
            let segmentPosition = this.canvas.height - (i * distanceBetweenSegments);
            depth += depthGradient;

            if (useVariableBranching) {
                this.drawBranchVariable(ctx, this.canvas.width / 2, segmentPosition, length, -Math.PI / 2, depth, angleVariation, numberOfBranches);
            } else {
                this.drawBranch(ctx, this.canvas.width / 2, segmentPosition, length, -Math.PI / 2, depth, angleVariation);
            }

            // Apply symmetry logic
            if (useBilateralSymmetry) {
                this.drawBranch(ctx, this.canvas.width / 2, segmentPosition, length, Math.PI / 2, depth, angleVariation);
            }
            if (useUpDownSymmetry) {
                this.drawBranch(ctx, this.canvas.width / 2, segmentPosition, length, Math.PI, depth, angleVariation);
            }
            if (useRadialSymmetry) {
                for (let j = 0; j < 6; j++) {
                    this.drawBranch(ctx, this.canvas.width / 2, segmentPosition, length, (j * Math.PI) / 3, depth, angleVariation);
                }
            }
        }
    }

    drawBranch(ctx, x, y, length, angle, depth, angleVariation) {
        if (depth <= 0 || length < 1) return;

        const xEnd = x + Math.cos(angle) * length;
        const yEnd = y + Math.sin(angle) * length;

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(xEnd, yEnd);
        ctx.stroke();

        const angleRad = (angleVariation / 180) * Math.PI;

        this.drawBranch(ctx, xEnd, yEnd, length * 0.7, angle - angleRad, depth - 1, angleVariation);
        this.drawBranch(ctx, xEnd, yEnd, length * 0.7, angle + angleRad, depth - 1, angleVariation);
    }

    drawBranchVariable(ctx, x, y, length, angle, depth, angleVariation, numberOfBranches) {
        if (depth <= 0 || length < 1) return;

        const xEnd = x + Math.cos(angle) * length;
        const yEnd = y + Math.sin(angle) * length;

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(xEnd, yEnd);
        ctx.stroke();

        const angleRad = (angleVariation / 180) * Math.PI;
        const totalBranchingAngle = angleRad;
        const angleBetweenBranches = totalBranchingAngle / (numberOfBranches - 1);

        for (let i = 0; i < numberOfBranches; i++) {
            let branchAngle = angle - totalBranchingAngle / 2 + i * angleBetweenBranches;
            this.drawBranchVariable(ctx, xEnd, yEnd, length * 0.7, branchAngle, depth - 1, angleVariation, numberOfBranches);
        }
    }
}

// Event Listener for Gene Update
document.getElementById('updateBiomorph').addEventListener('click', () => {
    let newGenes = [];
    for (let i = 0; i < 22; i++) {
        const geneInput = document.getElementById(`gene${i}`);
        if (geneInput) newGenes.push(parseInt(geneInput.value));
    }
    parentBiomorph.genes = newGenes;
    parentBiomorph.draw();
});

// Progress Bar Control
function showProgressBar(show) {
    const progressContainer = document.getElementById('progressContainer');
    const progress = document.getElementById('progress');

    if (progressContainer) {
        if (show) {
            progressContainer.style.display = 'block';
            progress.value = 0;
        } else {
            progressContainer.style.display = 'none';
        }
    }
}

// Generate Children and show progress
function generateChildren() {
    const numberOfChildren = 8; // Update to 8 children for grid
    const progress = document.getElementById('progress');
    showProgressBar(true);

    childrenContainer.innerHTML = ''; // Clear the existing children
    for (let i = 0; i < numberOfChildren; i++) {
        const childCanvas = document.createElement('canvas');
        childCanvas.width = 220;
        childCanvas.height = 220;
        childCanvas.classList.add('child'); // Ensure proper class for styling
        childrenContainer.appendChild(childCanvas);
        const childBiomorph = new Biomorph(childCanvas, parentBiomorph.genes.slice());
        childBiomorph.mutateGenes();

        // Log the bounding coordinates of each child after it's added to the grid
        const childRect = childCanvas.getBoundingClientRect();
        console.log(`Child ${i + 1}: Coordinates = Top: ${childRect.top}, Left: ${childRect.left}, Width: ${childRect.width}, Height: ${childRect.height}`);

        childCanvas.addEventListener('click', () => {
            parentBiomorph = new Biomorph(parentCanvas, childBiomorph.genes);
            parentBiomorph.updateGeneFields(); // Update fields to show new parent's genes
            generateChildren(); // Regenerate children
        });

        progress.value = ((i + 1) / numberOfChildren) * 100;
    }

    showProgressBar(false);
}

// Ensure canvas size remains proportional
function resizeCanvas() {
    const parentCanvas = document.getElementById('parentCanvas');
    parentCanvas.width = parentCanvas.clientWidth;
    parentCanvas.height = parentCanvas.clientHeight;
    if (parentBiomorph) {
        parentBiomorph.draw(); // Ensure the parentBiomorph exists before drawing
    }
}

// Set dynamic grid layout for children (2x4 by default)
function setChildrenGrid(rows = 2, columns = 4) {
    const childrenContainer = document.getElementById('childrenContainer');
    childrenContainer.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
}

// Initialize layout
setChildrenGrid(2, 4); // Default 2x4 grid

// Initialize parent biomorph
let parentCanvas = document.getElementById('parentCanvas');
let parentBiomorph = new Biomorph(parentCanvas); // Initialize the parent biomorph before use

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

document.addEventListener('DOMContentLoaded', () => {
    // Set default for all checkboxes to unchecked
    document.getElementById('toggleVariableBranching').checked = false;
    document.getElementById('toggleBilateralSymmetry').checked = true;
    document.getElementById('toggleUpDownSymmetry').checked = true;
    document.getElementById('toggleRadialSymmetry').checked = false;
    document.getElementById('toggleAlternatingAsymmetry').checked = false;

    // Generate initial biomorphs and set up events
    parentBiomorph = new Biomorph(parentCanvas); // Initialize parent biomorph
    generateChildren();
});




