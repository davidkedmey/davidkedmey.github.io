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
                // Make the color genes brighter
                genes.push(Math.floor(Math.random() * 106) + 150); // Range of 150-255 for RGB
            } else {
                genes.push(Math.floor(Math.random() * 21)); // Range of 0-20 for other genes
            }
        }
        return genes;
    }
    

    mutateGenes() {
        const geneToMutate = Math.floor(Math.random() * this.genes.length);
        this.genes[geneToMutate] = Math.floor(Math.random() * 21);
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
        const depth = this.genes[0] % 6 + 5;  // Now the range is 5-10, assuming you want
        const angleVariation = (this.genes[1] / 20) * Math.PI; // Angle variation based on gene 1
        const length = this.canvas.height / 10 + this.genes[2]; // Length of branches based on gene 2

        this.drawBranch(ctx, this.canvas.width / 2, this.canvas.height - 10, length, -Math.PI / 2, depth, angleVariation);
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
