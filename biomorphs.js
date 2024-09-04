class Biomorph {
    constructor(canvas, genes = null) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.genes = genes || this.randomizeGenes();
        this.draw();
    }

    randomizeGenes() {
        let genes = [];
        for (let i = 0; i < 14; i++) {
            if (i >= 7 && i <= 9) {
                genes.push(Math.floor(Math.random() * 106) + 150); // Range of 150-255 for RGB
            } else {
                genes.push(Math.floor(Math.random() * 21)); // Range of 0-20 for other genes
            }
        }
        // Add new symmetry, segmentation, and gradient genes
        genes.push(Math.floor(Math.random() * 2)); // Gene 14: Bilateral symmetry (left-right)
        genes.push(Math.floor(Math.random() * 2)); // Gene 15: Up-down symmetry
        genes.push(Math.floor(Math.random() * 2)); // Gene 16: Radial symmetry
        genes.push(Math.floor(Math.random() * 10) + 1); // Gene 17: Number of segments (1-10)
        genes.push(Math.floor(Math.random() * 50) + 20); // Gene 18: Distance between segments (20-70)
        genes.push(Math.floor(Math.random() * 10) - 5); // Gene 19: Gradient for depth change per segment (-5 to 5)
        genes.push(Math.floor(Math.random() * 10) - 5); // Gene 20: Gradient for angle variation change per segment (-5 to 5)
        return genes;
    }

    mutateGenes() {
        const geneToMutate = Math.floor(Math.random() * this.genes.length);
        if (geneToMutate >= 14 && geneToMutate <= 20) {
            // Mutate the new genes appropriately
            if (geneToMutate === 17) {
                this.genes[geneToMutate] = Math.floor(Math.random() * 10) + 1; // Re-randomize segments
            } else if (geneToMutate === 18) {
                this.genes[geneToMutate] = Math.floor(Math.random() * 50) + 20; // Re-randomize distance
            } else if (geneToMutate >= 19) {
                this.genes[geneToMutate] = Math.floor(Math.random() * 10) - 5; // Re-randomize gradients
            } else {
                this.genes[geneToMutate] = this.genes[geneToMutate] === 0 ? 1 : 0;
            }
        } else {
            this.genes[geneToMutate] = Math.floor(Math.random() * 21);
        }
        this.draw();
    }

    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Color based on genes 7, 8, 9
        const r = Math.floor((this.genes[7] / 20) * 255);
        const g = Math.floor((this.genes[8] / 20) * 255);
        const b = Math.floor((this.genes[9] / 20) * 255);
        ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;

        // Branching structure based on genes 0, 1, 2 (depth, angle variation)
        let depth = this.genes[0] % 6 + 5;
        let angleVariation = (this.genes[1] / 20) * Math.PI;
        const length = this.canvas.height / 10 + this.genes[2];

        // Symmetry genes
        const bilateralSymmetry = document.getElementById('toggleBilateralSymmetry').checked ? this.genes[14] : 0;
        const upDownSymmetry = document.getElementById('toggleUpDownSymmetry').checked ? this.genes[15] : 0;
        const radialSymmetry = document.getElementById('toggleRadialSymmetry').checked ? this.genes[16] : 0;

        // Segmentation genes
        const numberOfSegments = this.genes[17]; // Gene for number of segments
        const distanceBetweenSegments = this.genes[18]; // Gene for distance between segments
        const segmentationEnabled = document.getElementById('toggleSegmentation').checked; // Toggle for segmentation

        // Gradient genes
        const depthGradient = this.genes[19]; // Gradient for depth
        const angleGradient = this.genes[20]; // Gradient for angle variation
        const gradientEnabled = document.getElementById('toggleGradient').checked; // Toggle for gradient

        // Alternating Asymmetry Toggle
        const alternatingAsymmetry = document.getElementById('toggleAlternatingAsymmetry').checked;

        for (let i = 0; i < (segmentationEnabled ? numberOfSegments : 1); i++) {
            // Adjust depth and angle based on gradient if enabled
            if (gradientEnabled) {
                depth += depthGradient;
                angleVariation += (angleGradient / 20) * Math.PI;
            }

            // Alternate the direction of asymmetry if enabled
            let currentAngleVariation = angleVariation;
            if (alternatingAsymmetry && i % 2 === 1) {
                currentAngleVariation = -angleVariation; // Reverse the direction for alternating segments
            }

            this.drawBranch(ctx, this.canvas.width / 2, this.canvas.height - 10 - i * distanceBetweenSegments, length, -Math.PI / 2, depth, currentAngleVariation);

            // Apply symmetry based on gene configuration
            if (bilateralSymmetry) {
                this.drawBranch(ctx, this.canvas.width / 2, this.canvas.height - 10 - i * distanceBetweenSegments, length, -Math.PI / 2, depth, -currentAngleVariation);
            }
            if (upDownSymmetry) {
                this.drawBranch(ctx, this.canvas.width / 2, 10 + i * distanceBetweenSegments, length, Math.PI / 2, depth, currentAngleVariation);
            }
            if (radialSymmetry) {
                this.drawBranch(ctx, this.canvas.width / 2, this.canvas.height - 10 - i * distanceBetweenSegments, length, Math.PI / 4, depth, currentAngleVariation);
                this.drawBranch(ctx, this.canvas.width / 2, this.canvas.height - 10 - i * distanceBetweenSegments, length, -Math.PI / 4, depth, currentAngleVariation);
            }
        }
    }

    drawBranch(ctx, x, y, length, angle, depth, angleVariation) {
        if (depth <= 0) return;

        const xEnd = x + Math.cos(angle) * length;
        const yEnd = y + Math.sin(angle) * length;

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(xEnd, yEnd);
        ctx.stroke();

        this.drawBranch(ctx, xEnd, yEnd, length * 0.7, angle - angleVariation, depth - 1, angleVariation);
        this.drawBranch(ctx, xEnd, yEnd, length * 0.7, angle + angleVariation, depth - 1, angleVariation);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const parentCanvas = document.getElementById('parentCanvas');
    const childrenContainer = document.getElementById('childrenContainer');
    let parentBiomorph = new Biomorph(parentCanvas);

    document.getElementById('randomize').addEventListener('click', () => {
        parentBiomorph = new Biomorph(parentCanvas);
        generateChildren();
    });

    function generateChildren() {
        childrenContainer.innerHTML = ''; // Clear existing children
        for (let i = 0; i < 8; i++) { // Assuming you want 8 children
            const childCanvas = document.createElement('canvas');
            childCanvas.width = 220; // Set the width equal to the parent's width
            childCanvas.height = 220; // Set the height equal to the parent's height
            childrenContainer.appendChild(childCanvas);
            const childBiomorph = new Biomorph(childCanvas, parentBiomorph.genes.slice());
            childBiomorph.mutateGenes();
            childCanvas.addEventListener('click', () => {
                parentBiomorph = new Biomorph(parentCanvas, childBiomorph.genes);
                generateChildren();
            });
        }
    }

    generateChildren();
});

