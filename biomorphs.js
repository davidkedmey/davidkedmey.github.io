class Biomorph {
    constructor(canvas, genes = null) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.genes = genes || this.randomizeGenes();
        this.maxDepth = 10; // Limit recursion depth to prevent overdraw
        this.draw(); // Draw immediately
        this.updateGeneFields(); // Update the gene input fields on the HTML
    }

    randomizeGenes() {
        let genes = [];
        for (let i = 0; i < 14; i++) { // General and RGB genes
            genes.push(i >= 7 && i <= 9 ? Math.floor(Math.random() * 106) + 150 : Math.floor(Math.random() * 21));
        }
        // Symmetry and segmentation genes
        genes.push(...Array.from({length: 3}, () => Math.floor(Math.random() * 2))); // Symmetry genes
        genes.push(Math.floor(Math.random() * 10) + 1); // Number of segments
        genes.push(Math.floor(Math.random() * 50) + 20); // Distance between segments
        genes.push(Math.floor(Math.random() * 10) - 5); // Depth gradient per segment
        genes.push(Math.floor(Math.random() * 10) - 5); // Angle variation gradient per segment
        return genes;
    }

    mutateGenes() {
        const geneToMutate = Math.floor(Math.random() * this.genes.length);
        this.genes[geneToMutate] = Math.floor(Math.random() * (geneToMutate >= 14 && geneToMutate <= 20 ? 50 : 21));
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

        let depth = this.genes[0];
        let angleVariation = (this.genes[1] / 20) * Math.PI;
        let length = this.canvas.height / 10 + this.genes[2];
        let numberOfSegments = this.genes[17];
        let distanceBetweenSegments = this.genes[18];
        let depthGradient = this.genes[19];
        let angleGradient = this.genes[20];

        for (let i = 0; i < numberOfSegments; i++) {
            let segmentPosition = this.canvas.height - (i * distanceBetweenSegments);
            depth += depthGradient;
            angleVariation += (angleGradient / 20) * Math.PI;

            // Draw the main branch for each segment
            this.drawBranch(ctx, this.canvas.width / 2, segmentPosition, length, -Math.PI / 2, depth, angleVariation);

            if (this.genes[14]) { // Bilateral symmetry
                this.drawBranch(ctx, this.canvas.width / 2, segmentPosition, length, -Math.PI / 2, depth, -angleVariation);
            }

            if (this.genes[15]) { // Up-down symmetry
                this.drawBranch(ctx, this.canvas.width / 2, this.canvas.height - segmentPosition, length, Math.PI / 2, depth, angleVariation);
            }

            if (this.genes[16]) { // Radial symmetry
                for (let j = 1; j < 4; j++) {
                    this.drawBranch(ctx, this.canvas.width / 2, segmentPosition, length, j * (Math.PI / 2), depth, angleVariation);
                }
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

        // Recurse for the next level of branches
        this.drawBranch(ctx, xEnd, yEnd, length * 0.7, angle - angleVariation, depth - 1, angleVariation);
        this.drawBranch(ctx, xEnd, yEnd, length * 0.7, angle + angleVariation, depth - 1, angleVariation);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const parentCanvas = document.getElementById('parentCanvas');
    let parentBiomorph = new Biomorph(parentCanvas);

    document.getElementById('randomize').addEventListener('click', () => {
        parentBiomorph = new Biomorph(parentCanvas);
    });

    document.getElementById('updateBiomorph').addEventListener('click', () => {
        const genes = Array.from({length: 10}, (_, i) => parseInt(document.getElementById(`gene${i}`).value, 10));
        genes.push(...[1, 1, 1, 5, 40, 0, 0]); // Reinitialize other genes for simplicity
        parentBiomorph = new Biomorph(parentCanvas, genes);
    });
});

