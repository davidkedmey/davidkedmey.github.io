class Biomorph {
    constructor(canvas, genes = null) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.genes = genes || this.randomizeGenes();
        this.draw(); // Draw immediately
        this.updateGeneFields();
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
        genes.push(Math.floor(Math.random() * 2)); // Bilateral symmetry
        genes.push(Math.floor(Math.random() * 2)); // Up-down symmetry
        genes.push(Math.floor(Math.random() * 2)); // Radial symmetry
        genes.push(Math.floor(Math.random() * 10) + 1); // Number of segments (1-10)
        genes.push(Math.floor(Math.random() * 50) + 20); // Distance between segments (20-70)
        genes.push(Math.floor(Math.random() * 10) - 5); // Gradient for depth change per segment (-5 to 5)
        genes.push(Math.floor(Math.random() * 10) - 5); // Gradient for angle variation change per segment (-5 to 5)
        return genes;
    }

    mutateGenes() {
        const geneToMutate = Math.floor(Math.random() * this.genes.length);
        if (geneToMutate >= 14 && geneToMutate <= 20) {
            if (geneToMutate === 17) {
                this.genes[geneToMutate] = Math.floor(Math.random() * 10) + 1;
            } else if (geneToMutate === 18) {
                this.genes[geneToMutate] = Math.floor(Math.random() * 50) + 20;
            } else if (geneToMutate >= 19) {
                this.genes[geneToMutate] = Math.floor(Math.random() * 10) - 5;
            } else {
                this.genes[geneToMutate] = this.genes[geneToMutate] === 0 ? 1 : 0;
            }
        } else {
            this.genes[geneToMutate] = Math.floor(Math.random() * 21);
        }
        this.draw(); // Immediately draw the updated biomorph
        this.updateGeneFields();
    }

    updateGeneFields() {
        for (let i = 0; i < 10; i++) {
            document.getElementById(`gene${i}`).value = this.genes[i];
        }
        // Update additional fields for symmetry, segmentation, etc.
    }

    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        const r = this.genes[7];
        const g = this.genes[8];
        const b = this.genes[9];
        ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;

        let depth = this.genes[0] % 6 + 5;
        let angleVariation = (this.genes[1] / 20) * Math.PI;
        const length = this.canvas.height / 10 + this.genes[2];

        const bilateralSymmetry = document.getElementById('toggleBilateralSymmetry').checked ? this.genes[14] : 0;
        const upDownSymmetry = document.getElementById('toggleUpDownSymmetry').checked ? this.genes[15] : 0;
        const radialSymmetry = document.getElementById('toggleRadialSymmetry').checked ? this.genes[16] : 0;

        const numberOfSegments = this.genes[17];
        const distanceBetweenSegments = this.genes[18];
        const segmentationEnabled = document.getElementById('toggleSegmentation').checked;

        const depthGradient = this.genes[19];
        const angleGradient = this.genes[20];
        const gradientEnabled = document.getElementById('toggleGradient').checked;

        const alternatingAsymmetry = document.getElementById('toggleAlternatingAsymmetry').checked;

        for (let i = 0; i < (segmentationEnabled ? numberOfSegments : 1); i++) {
            if (gradientEnabled) {
                depth += depthGradient;
                angleVariation += (angleGradient / 20) * Math.PI;
            }

            let currentAngleVariation = angleVariation;
            if (alternatingAsymmetry && i % 2 === 1) {
                currentAngleVariation = -angleVariation;
            }

            this.drawBranch(ctx, this.canvas.width / 2, this.canvas.height - 10 - i * distanceBetweenSegments, length, -Math.PI / 2, depth, currentAngleVariation);

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

    document.getElementById('updateBiomorph').addEventListener('click', () => {
        const genes = [];
        for (let i = 0; i < 10; i++) {
            genes.push(parseInt(document.getElementById(`gene${i}`).value, 10));
        }
        // Fill in missing genes
        genes.push(1, 1, 1, 5, 40, 0, 0); // Adding symmetry, segmentation, etc.
        parentBiomorph = new Biomorph(parentCanvas, genes);

        generateChildren(); // Now generate children based on the updated parent
    });

    function generateChildren() {
    childrenContainer.innerHTML = ''; // Clear the existing children
    for (let i = 0; i < 7; i++) { // Display 7 children
        const childCanvas = document.createElement('canvas');
        childCanvas.width = 220;
        childCanvas.height = 220;
        childCanvas.classList.add('child'); // Class for potential future styling
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







