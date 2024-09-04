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
        // Add new symmetry and segmentation genes
        genes.push(Math.floor(Math.random() * 2)); // Gene 14: Bilateral symmetry (left-right)
        genes.push(Math.floor(Math.random() * 2)); // Gene 15: Up-down symmetry
        genes.push(Math.floor(Math.random() * 2)); // Gene 16: Radial symmetry
        genes.push(Math.floor(Math.random() * 10) + 1); // Gene 17: Number of segments (1-10)
        genes.push(Math.floor(Math.random() * 50) + 20); // Gene 18: Distance between segments (20-70)
        return genes;
    }

    mutateGenes() {
        const geneToMutate = Math.floor(Math.random() * this.genes.length);
        if (geneToMutate >= 14 && geneToMutate <= 18) {
            if (geneToMutate === 17) {
                this.genes[geneToMutate] = Math.floor(Math.random() * 10) + 1; // Re-randomize segments
            } else if (geneToMutate === 18) {
                this.genes[geneToMutate] = Math.floor(Math.random() * 50) + 20; // Re-randomize distance
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
        const depth = this.genes[0] % 6 + 5;
        const angleVariation = (this.genes[1] / 20) * Math.PI;
        const length = this.canvas.height / 10 + this.genes[2];

        // Symmetry genes
        const bilateralSymmetry = document.getElementById('toggleBilateralSymmetry').checked ? this.genes[14] : 0;
        const upDownSymmetry = document.getElementById('toggleUpDownSymmetry').checked ? this.genes[15] : 0;
        const radialSymmetry = document.getElementById('toggleRadialSymmetry').checked ? this.genes[16] : 0;

        // Segmentation genes
        const numberOfSegments = this.genes[17]; // Gene for number of segments
        const distanceBetweenSegments = this.genes[18]; // Gene for distance between segments
        const segmentationEnabled = document.getElementById('toggleSegmentation').checked; // Toggle for segmentation

        // Display gene values on the screen
        this.displayGeneValues();

        for (let i = 0; i < (segmentationEnabled ? numberOfSegments : 1); i++) {
            this.drawBranch(ctx, this.canvas.width / 2, this.canvas.height - 10 - i * distanceBetweenSegments, length, -Math.PI / 2, depth, angleVariation);

            if (bilateralSymmetry) {
                this.drawBranch(ctx, this.canvas.width / 2, this.canvas.height - 10 - i * distanceBetweenSegments, length, -Math.PI / 2, depth, -angleVariation);
            }
            if (upDownSymmetry) {
                this.drawBranch(ctx, this.canvas.width / 2, 10 + i * distanceBetweenSegments, length, Math.PI / 2, depth, angleVariation);
            }
            if (radialSymmetry) {
                this.drawBranch(ctx, this.canvas.width / 2, this.canvas.height - 10 - i * distanceBetweenSegments, length, Math.PI / 4, depth, angleVariation);
                this.drawBranch(ctx, this.canvas.width / 2, this.canvas.height - 10 - i * distanceBetweenSegments, length, -Math.PI / 4, depth, angleVariation);
            }
        }
    }

    drawBranch(ctx, x, y, length, angle, depth, angleVariation) {
        if (depth === 0) return;

        const xEnd = x + Math.cos(angle) * length;
        const yEnd = y + Math.sin(angle) * length;

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(xEnd, yEnd);
        ctx.stroke();

        this.drawBranch(ctx, xEnd, yEnd, length * 0.7, angle - angleVariation, depth - 1, angleVariation);
        this.drawBranch(ctx, xEnd, yEnd, length * 0.7, angle + angleVariation, depth - 1, angleVariation);
    }

    displayGeneValues() {
        const geneOutput = document.getElementById('geneOutput');
        geneOutput.innerHTML = `
          <p><strong>Genes:</strong></p>
          <p>Segments: ${this.genes[17]}</p>
          <p>Distance Between Segments: ${this.genes[18]}</p>
          <p>Bilateral Symmetry: ${this.genes[14]}</p>
          <p>Up-Down Symmetry: ${this.genes[15]}</p>
          <p>Radial Symmetry: ${this.genes[16]}</p>
        `;
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

