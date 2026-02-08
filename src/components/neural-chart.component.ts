import { Component, ElementRef, Input, OnChanges, ViewChild, ViewEncapsulation } from '@angular/core';

declare const d3: any;

@Component({
  selector: 'app-neural-chart',
  standalone: true,
  template: `<div #chartContainer class="w-full h-40"></div>`,
  styles: [`
    .line { fill: none; stroke: #00f3ff; stroke-width: 2px; }
    .area { fill: rgba(0, 243, 255, 0.1); }
    .axis text { fill: #5a6a7a; font-family: 'Rajdhani', sans-serif; font-size: 10px; }
    .axis line, .axis path { stroke: #1a2a3a; }
  `],
  encapsulation: ViewEncapsulation.None
})
export class NeuralChartComponent implements OnChanges {
  @Input() complexity = 5;
  @ViewChild('chartContainer', { static: true }) chartContainer!: ElementRef;

  ngOnChanges() {
    this.renderChart();
  }

  renderChart() {
    const element = this.chartContainer.nativeElement;
    d3.select(element).selectAll("*").remove();

    const width = element.clientWidth;
    const height = element.clientHeight;
    const margin = { top: 10, right: 10, bottom: 20, left: 30 };

    const svg = d3.select(element)
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Simulate a forgetting curve: R = e^(-t/S)
    // S (Stability) varies by complexity. Higher complexity = faster decay initially.
    const dataPoints = [];
    const stability = 15 - this.complexity; // Simplified model
    
    for (let t = 0; t <= 30; t++) {
      const retention = Math.exp(-t / stability) * 100;
      dataPoints.push({ day: t, retention });
    }

    const x = d3.scaleLinear()
      .domain([0, 30])
      .range([0, width - margin.left - margin.right]);

    const y = d3.scaleLinear()
      .domain([0, 100])
      .range([height - margin.top - margin.bottom, 0]);

    // Add area
    svg.append("path")
      .datum(dataPoints)
      .attr("class", "area")
      .attr("d", d3.area()
        .x((d: any) => x(d.day))
        .y0(height - margin.top - margin.bottom)
        .y1((d: any) => y(d.retention))
      );

    // Add line
    svg.append("path")
      .datum(dataPoints)
      .attr("class", "line")
      .attr("d", d3.line()
        .x((d: any) => x(d.day))
        .y((d: any) => y(d.retention))
      );

    // X Axis
    svg.append("g")
      .attr("class", "axis")
      .attr("transform", `translate(0,${height - margin.top - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat((d: any) => `D+${d}`));

    // Y Axis
    svg.append("g")
      .attr("class", "axis")
      .call(d3.axisLeft(y).ticks(3).tickFormat((d: any) => `${d}%`));
  }
}