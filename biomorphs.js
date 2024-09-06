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
        this.genes[geneToMutate] = Math.floor(Math.random() * (geneToMutate >= 14 && geneToMutate <= 21 ? 30 : 21)); // Adjust mutation ranges
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

        for (let i = 0; i < numberOfSegments; i++) {
            let segmentPosition = this.canvas.height - (i * distanceBetweenSegments);
            depth += depthGradient;

            if (useVariableBranching) {
                // Variable Branching Case
                this.drawBranchVariable(ctx, this.canvas.width / 2, segmentPosition, length, -Math.PI / 2, depth, angleVariation, numberOfBranches);
            } else {
                // Uniform Base Case (two branches with a fixed angle)
                this.drawBranch(ctx, this.canvas.width / 2, segmentPosition, length, -Math.PI / 2, depth, angleVariation);
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

        // Convert angle variation from degrees to radians
        const angleRad = (angleVariation / 180) * Math.PI;

        // Draw two child branches with a fixed angle variation of ±angleRad
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

        // Convert angle variation from degrees to radians
        const angleRad = (angleVariation / 180) * Math.PI;

        // Distribute the branches within the total angle space
        const totalBranchingAngle = angleRad; // Total angle space for all branches
        const angleBetweenBranches = totalBranchingAngle / (numberOfBranches - 1); // Angle between each branch

        // Loop through each branch and draw it at the appropriate angle
        for (let i = 0; i < numberOfBranches; i++) {
            let branchAngle = angle - totalBranchingAngle / 2 + i * angleBetweenBranches; // Adjust angle for each branch
            this.drawBranchVariable(ctx, xEnd, yEnd, length * 0.7, branchAngle, depth - 1, angleVariation, numberOfBranches);
        }
    }
}

// Progress Bar Control
function showProgressBar(show) {
    const progressContainer = document.getElementById('progressContainer');
    const progress = document.getElementById('progress');

    if (show) {
        progressContainer.style.display = 'block';
        progress.value = 0;
    } else {
        progressContainer.style.display = 'none';
    }
}

// Debugging information
function generateChildren() {
    const numberOfChildren = 7;
    const progress = document.getElementById('progress');
    showProgressBar(true);

    childrenContainer.innerHTML = ''; // Clear the existing children
    for (let i = 0; i < numberOfChildren; i++) { // Display 7 children
        const childCanvas = document.createElement('canvas');
        childCanvas.width = 220;
        childCanvas.height = 220;
        childrenContainer.appendChild(childCanvas);
        const childBiomorph = new Biomorph(childCanvas, parentBiomorph.genes.slice());
        childBiomorph.mutateGenes();

        // Debugging output
        console.log(`Child ${i + 1}: Genes = ${childBiomorph.genes}`);
        console.log(`Child ${i + 1}: Canvas Position = ${childCanvas.getBoundingClientRect()}`);

        childCanvas.addEventListener('click', () => {
            parentBiomorph = new Biomorph(parentCanvas, childBiomorph.genes);
            parentBiomorph.updateGeneFields(); // Update fields to show new parent's genes
            generateChildren(); // Regenerate children
        });

        // Update progress
        progress.value = ((i + 1) / numberOfChildren) * 100;
    }

    showProgressBar(false);
}

document.addEventListener('DOMContentLoaded', () => {
    // Set default for all checkboxes to unchecked
    document.getElementById('toggleBilateralSymmetry').checked = false;
    document.getElementById('toggleUpDownSymmetry').checked = false;
    document.getElementById('toggleRadialSymmetry').checked = false;
    document.getElementById('toggleSegmentation').checked = false;
    document.getElementById('toggleGradient').checked = false;
    document.getElementById('toggleAlternatingAsymmetry').checked = false;
    document.getElementById('toggleVariableBranching').checked = false; // Default to uniform base case

    // Generate initial biomorphs and set up events
    generateChildren();
});
