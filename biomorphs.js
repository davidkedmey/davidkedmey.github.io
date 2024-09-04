class Biomorph {
    constructor(canvas, genes = null) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.genes = genes || this.randomizeGenes();
        this.segmentIndex = 0; // For tracking segments during animation
    }

    randomizeGenes() {
        let genes = [];
        for (let i = 0; i < 14; i++) {
            if (i >= 7 && i <= 9) {
                genes.push(Math.floor(Math.random() * 106) + 150); // Color genes: 150-255
            } else {
                genes.push(Math.floor(Math.random() * 21)); // Other genes: 0-20
            }
        }
        genes.push(Math.floor(Math.random() * 2)); // Bilateral symmetry (left-right)
        genes.push(Math.floor(Math.random() * 2)); // Up-down symmetry
        genes.push(Math.floor(Math.random() * 2)); // Radial symmetry
        genes.push(Math.floor(Math.random() * 10) + 1); // Number of segments (1-10)
        genes.push(Math.floor(Math.random() * 50) + 20); // Distance between segments (20-70)
        return genes;
    }

    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Color based on genes 7, 8, 9
        const r = Math.floor((this.genes[7] / 20) * 255);
        const g = Math.floor((this.genes[8] / 20) * 255);
        const b = Math.floor((this.genes[9] / 20) * 255);
        ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;

        // Branching structure based on genes 0, 1, 2
        const depth = this.genes[0] % 6 + 5;
        const angleVariation = (this.genes[1] / 20) * Math.PI;
        const length = this.canvas.height / 10 + this.genes[2];

        // Symmetry genes
        const bilateralSymmetry = this.genes[14];
        const upDownSymmetry = this.genes[15];
        const radialSymmetry = this.genes[16];

        this.drawBranch(ctx, this.canvas.width / 2, this.canvas.height - 10, length, -Math.PI / 2, depth, angleVariation);

        // Symmetry drawing logic
        if (bilateralSymmetry) {
            this.drawBranch(ctx, this.canvas.width / 2, this.canvas.height - 10, length, -Math.PI / 2, depth, -angleVariation);
        }
        if (upDownSymmetry) {
            this.drawBranch(ctx, this.canvas.width / 2, 10, length, Math.PI / 2, depth, angleVariation);
        }
        if (radialSymmetry) {
            this.drawBranch(ctx, this.canvas.width / 2, this.canvas.height - 10, length, Math.PI / 4, depth, angleVariation);
            this.drawBranch(ctx, this.canvas.width / 2, this.canvas.height - 10, length, -Math.PI / 4, depth, angleVariation);
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

    // Animate the drawing of the parent biomorph
    drawWithAnimation() {
        this.segmentIndex = 0;
        const numberOfSegments = this.genes[17];
        const distanceBetweenSegments = this.genes[18];

        const animateNextSegment = () => {
            if (this.segmentIndex < numberOfSegments) {
                this.draw(); // Draw the next segment
                this.segmentIndex++;
                requestAnimationFrame(animateNextSegment); // Schedule the next frame
            }
        };

        animateNextSegment();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const parentCanvas = document.getElementById('parentCanvas');
    const childrenContainer = document.getElementById('childrenContainer');
    let parentBiomorph = new Biomorph(parentCanvas);

    // Draw the parent biomorph with animation
    document.getElementById('randomize').addEventListener('click', () => {
        parentBiomorph = new Biomorph(parentCanvas);
        parentBiomorph.drawWithAnimation(); // Apply animation only to the parent biomorph
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
            childBiomorph.draw(); // Draw the children biomorphs directly, without animation
            childCanvas.addEventListener('click', () => {
                parentBiomorph = new Biomorph(parentCanvas, childBiomorph.genes);
                parentBiomorph.drawWithAnimation(); // Apply animation when selecting a child biomorph
                generateChildren();
            });
        }
    }

    parentBiomorph.drawWithAnimation(); // Initial draw with animation
    generateChildren(); // Generate children directly without animation
});






