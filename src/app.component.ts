import { Component, computed, inject, signal, effect, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { GeminiService } from './services/gemini.service';
import { NeuralChartComponent } from './components/neural-chart.component';

interface ReviewSession {
  date: string; // ISO string (Scheduled Date)
  completed: boolean;
  completedDate?: string; // ISO string (Actual Completion Date)
  interval: number; // Days since last review
  type: 'initial' | 'standard' | 'final' | 'recovery';
  rating?: 'hard' | 'good' | 'easy';
}

interface Topic {
  id: string;
  name: string;
  addedDate: string;
  examDate?: string;
  complexity: number;
  subtopics: string[];
  summary: string;
  reviews: ReviewSession[];
  nextReviewDate: string;
  mastery: number; // 0-100 score
  notes?: string; // User notes
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, NeuralChartComponent],
  templateUrl: './app.component.html'
})
export class AppComponent {
  private geminiService = inject(GeminiService);

  // State
  topics = signal<Topic[]>([]);
  activeView = signal<'dashboard' | 'add' | 'details'>('dashboard');
  selectedTopicId = signal<string | null>(null);
  isLoading = signal<boolean>(false);
  
  // Forms
  newTopicName = new FormControl('', [Validators.required, Validators.minLength(3)]);
  newTopicContext = new FormControl('');
  newTopicDate = new FormControl('');

  // Computed
  selectedTopic = computed(() => 
    this.topics().find(t => t.id === this.selectedTopicId()) || null
  );

  upcomingReviews = computed(() => {
    const allReviews: { topicName: string; date: string; topicId: string, daysAway: number, type: string }[] = [];
    const today = new Date();
    today.setHours(0,0,0,0);

    this.topics().forEach(topic => {
      const next = topic.reviews.find(r => !r.completed && new Date(r.date) >= today);
      if (next) {
        const reviewDate = new Date(next.date);
        const diffTime = reviewDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        allReviews.push({
          topicName: topic.name,
          date: next.date,
          topicId: topic.id,
          daysAway: diffDays,
          type: next.type
        });
      }
    });

    return allReviews.sort((a, b) => a.daysAway - b.daysAway);
  });

  weeklyWorkload = computed(() => {
    const workload = Array(7).fill(0).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return { 
        date: d, 
        dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
        count: 0,
        isHeavy: false 
      };
    });

    const today = new Date();
    today.setHours(0,0,0,0);

    this.topics().forEach(topic => {
      topic.reviews.forEach(review => {
        if (!review.completed) {
          const rDate = new Date(review.date);
          rDate.setHours(0,0,0,0);
          
          const diffTime = rDate.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays >= 0 && diffDays < 7) {
            workload[diffDays].count++;
          }
        }
      });
    });

    return workload.map(d => ({ ...d, isHeavy: d.count > 3 }));
  });

  // NEW: History Heatmap (Last 60 days)
  activityHeatmap = computed(() => {
    const days = 60;
    const map = new Map<string, number>();

    this.topics().forEach(t => {
      t.reviews.forEach(r => {
        // Use completedDate if available, otherwise fallback (for old data)
        if (r.completed) {
          const dateStr = (r.completedDate || r.date).split('T')[0];
          map.set(dateStr, (map.get(dateStr) || 0) + 1);
        }
      });
    });

    const grid = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = map.get(dateStr) || 0;
      
      // Intensity 0-4
      let intensity = 0;
      if (count > 0) intensity = 1;
      if (count > 2) intensity = 2;
      if (count > 5) intensity = 3;
      if (count > 8) intensity = 4;

      grid.push({ date: dateStr, count, intensity });
    }
    return grid;
  });

  get minDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  constructor() {
    const stored = localStorage.getItem('cortex_topics');
    if (stored) {
      this.topics.set(JSON.parse(stored));
    }

    effect(() => {
      localStorage.setItem('cortex_topics', JSON.stringify(this.topics()));
    });
  }

  setView(view: 'dashboard' | 'add' | 'details', id: string | null = null) {
    this.activeView.set(view);
    this.selectedTopicId.set(id);
  }

  async analyzeAndAddTopic() {
    if (this.newTopicName.invalid) return;

    this.isLoading.set(true);
    const name = this.newTopicName.value!;
    const context = this.newTopicContext.value || 'General study';
    const examDate = this.newTopicDate.value || undefined;

    try {
      const analysis = await this.geminiService.analyzeTopic(name, context);
      
      const newTopic: Topic = {
        id: crypto.randomUUID(),
        name: name,
        addedDate: new Date().toISOString(),
        examDate: examDate,
        complexity: analysis.complexity,
        subtopics: analysis.subtopics,
        summary: analysis.summary,
        reviews: this.generateSchedule(analysis.complexity, examDate),
        nextReviewDate: '',
        mastery: 0,
        notes: ''
      };
      
      if (newTopic.reviews.length > 0) {
        newTopic.nextReviewDate = newTopic.reviews[0].date;
      } else {
        newTopic.nextReviewDate = 'No Reviews Scheduled';
      }

      this.topics.update(list => [newTopic, ...list]);
      this.newTopicName.reset();
      this.newTopicContext.reset();
      this.newTopicDate.reset();
      this.setView('dashboard');
    } catch (err) {
      console.error(err);
      alert('Neural Link disrupted. Analysis failed.');
    } finally {
      this.isLoading.set(false);
    }
  }

  generateSchedule(complexity: number, examDateStr?: string): ReviewSession[] {
    const schedule: ReviewSession[] = [];
    let interval = 1;
    let runningDate = new Date();
    runningDate.setDate(runningDate.getDate() + 1);

    const examDate = examDateStr ? new Date(examDateStr) : null;
    const baseMultiplier = 2.5; 
    const multiplier = Math.max(1.3, baseMultiplier - (complexity * 0.12));

    let maxReviews = 20;

    while (maxReviews > 0) {
      if (examDate && runningDate > examDate) break;

      schedule.push({
        date: runningDate.toISOString(),
        completed: false,
        interval: Math.round(interval),
        type: schedule.length === 0 ? 'initial' : 'standard'
      });

      interval = interval * multiplier;
      const nextJump = Math.ceil(interval);
      const nextDate = new Date(runningDate);
      nextDate.setDate(nextDate.getDate() + nextJump);
      runningDate = nextDate;
      maxReviews--;
    }

    if (examDate) {
      if (schedule.length === 0) {
         schedule.push({
           date: examDate.toISOString(),
           completed: false,
           interval: 0,
           type: 'final'
         });
      } else {
        const lastReviewDate = new Date(schedule[schedule.length - 1].date);
        const diffTime = examDate.getTime() - lastReviewDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > 4) {
           const finalReview = new Date(examDate);
           finalReview.setDate(finalReview.getDate() - 2);
           if (finalReview > lastReviewDate) {
             schedule.push({
               date: finalReview.toISOString(),
               completed: false,
               interval: diffDays - 2,
               type: 'final'
             });
           }
        }
      }
    }

    return schedule;
  }

  markReviewComplete(topicId: string, reviewDate: string, rating: 'hard' | 'good' | 'easy') {
    this.topics.update(topics => {
      return topics.map(t => {
        if (t.id !== topicId) return t;
        
        let reviews = [...t.reviews];
        const reviewIndex = reviews.findIndex(r => r.date === reviewDate);
        if (reviewIndex === -1) return t;

        // Mark as complete with Rating and Actual Completion Date
        reviews[reviewIndex] = { 
          ...reviews[reviewIndex], 
          completed: true, 
          rating,
          completedDate: new Date().toISOString()
        };

        // DYNAMIC RESCHEDULING LOGIC
        if (rating === 'hard') {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          const exists = reviews.some(r => r.date.split('T')[0] === tomorrow.toISOString().split('T')[0]);
          if (!exists) {
            reviews.push({
              date: tomorrow.toISOString(),
              completed: false,
              interval: 1,
              type: 'recovery'
            });
            reviews.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          }
        } 
        else if (rating === 'easy') {
          const nextIndex = reviews.findIndex((r, idx) => idx > reviewIndex && !r.completed && r.type !== 'final');
          if (nextIndex !== -1) {
             const nextReview = reviews[nextIndex];
             const oldDate = new Date(nextReview.date);
             const today = new Date();
             const currentDiff = oldDate.getTime() - today.getTime();
             const newDiff = currentDiff * 1.3; 
             const newDate = new Date(today.getTime() + newDiff);
             reviews[nextIndex] = {
               ...nextReview,
               date: newDate.toISOString(),
               interval: Math.ceil(newDiff / (1000 * 60 * 60 * 24))
             };
             reviews.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          }
        }

        const completedCount = reviews.filter(r => r.completed).length;
        const goodOrEasyCount = reviews.filter(r => r.completed && (r.rating === 'good' || r.rating === 'easy')).length;
        const newMastery = completedCount > 0 ? Math.round((goodOrEasyCount / completedCount) * 100) : 0;

        const next = reviews.find(r => !r.completed && new Date(r.date) >= new Date());
        
        return {
          ...t,
          reviews: reviews,
          mastery: newMastery,
          nextReviewDate: next ? next.date : 'Completed'
        };
      });
    });
  }

  // Update Notes for a topic
  updateNotes(topicId: string, event: Event) {
    const text = (event.target as HTMLTextAreaElement).value;
    this.topics.update(topics => 
      topics.map(t => t.id === topicId ? { ...t, notes: text } : t)
    );
  }

  // Scientific Advice Generator
  getAdvice(topic: Topic): string {
    const reviews = topic.reviews.filter(r => r.completed);
    if (reviews.length < 3) return "INSUFFICIENT DATA FOR ANALYSIS.";
    
    const hard = reviews.filter(r => r.rating === 'hard').length;
    const easy = reviews.filter(r => r.rating === 'easy').length;
    const total = reviews.length;

    if (hard / total > 0.4) return "CRITICAL: High failure rate. Recommendation: Deconstruct topic into smaller sub-modules.";
    if (easy / total > 0.6) return "EFFICIENCY WARNING: Interval density too high. Extending future horizons to prevent over-learning.";
    return "OPTIMAL: Retention curve within expected parameters.";
  }

  deleteTopic(id: string) {
    if(confirm('Purge this data packet from memory?')) {
        this.topics.update(list => list.filter(t => t.id !== id));
        this.setView('dashboard');
    }
  }

  formatDate(iso: string): string {
    if (!iso) return 'N/A';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  getDaysUntil(dateStr?: string): string {
    if (!dateStr) return '';
    const diff = new Date(dateStr).getTime() - new Date().getTime();
    const days = Math.ceil(diff / (1000 * 3600 * 24));
    return days > 0 ? `${days} DAYS REMAINING` : 'DATE PASSED';
  }
}