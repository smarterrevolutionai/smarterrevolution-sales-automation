#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// Configuration
const STATE_FILE = '/opt/smarty-projects/sequence-state.json';
const SMS_SCRIPT = '/opt/smarty-projects/sms-touch.js';

// Sequence steps configuration
const SEQUENCE_CONFIG = [
  { step: 0, days: 0, channel: 'email', action: 'Initial reply sent' },
  { step: 1, days: 1, channel: 'linkedin', action: 'LinkedIn connection request' },
  { step: 2, days: 3, channel: 'sms', action: 'SMS touch #1', template: 'follow-up-1' },
  { step: 3, days: 5, channel: 'email', action: 'Email follow-up #2' },
  { step: 4, days: 7, channel: 'sms', action: 'SMS touch #2', template: 'follow-up-2' },
  { step: 5, days: 10, channel: 'email', action: 'Final email' },
  { step: 6, days: 14, channel: 'end', action: 'Mark as cold' }
];

class SequenceOrchestrator {
  constructor() {
    this.ensureStateFile();
  }

  ensureStateFile() {
    if (!fs.existsSync(STATE_FILE)) {
      this.writeState({ sequences: [] });
    }
  }

  readState() {
    try {
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading state file:', error.message);
      return { sequences: [] };
    }
  }

  writeState(state) {
    const tempFile = STATE_FILE + '.tmp';
    try {
      fs.writeFileSync(tempFile, JSON.stringify(state, null, 2));
      fs.renameSync(tempFile, STATE_FILE);
    } catch (error) {
      console.error('Error writing state file:', error.message);
      // Clean up temp file if it exists
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      throw error;
    }
  }

  addToSequence(email, name, company, phone = null) {
    const state = this.readState();
    
    // Check if lead already exists
    const existing = state.sequences.find(seq => seq.email === email);
    if (existing) {
      throw new Error(`Lead ${email} is already in sequence (ID: ${existing.id})`);
    }

    const now = new Date();
    const sequence = {
      id: crypto.randomUUID(),
      email,
      name,
      company,
      phone,
      startDate: now.toISOString().split('T')[0],
      currentStep: 0,
      nextActionDate: now.toISOString().split('T')[0],
      nextChannel: 'email',
      status: 'active',
      history: [
        {
          step: 0,
          date: now.toISOString().split('T')[0],
          channel: 'email',
          action: 'Initial reply sent'
        }
      ]
    };

    // Set next action (step 1)
    this.setNextAction(sequence);

    state.sequences.push(sequence);
    this.writeState(state);

    return sequence;
  }

  removeFromSequence(email) {
    const state = this.readState();
    const index = state.sequences.findIndex(seq => seq.email === email);
    
    if (index === -1) {
      throw new Error(`Lead ${email} not found in sequences`);
    }

    const removed = state.sequences.splice(index, 1)[0];
    this.writeState(state);

    return removed;
  }

  setNextAction(sequence) {
    const nextStep = sequence.currentStep + 1;
    const config = SEQUENCE_CONFIG.find(c => c.step === nextStep);
    
    if (!config) {
      sequence.status = 'completed';
      sequence.nextActionDate = null;
      sequence.nextChannel = null;
      return;
    }

    const startDate = new Date(sequence.startDate);
    const nextDate = new Date(startDate);
    nextDate.setDate(startDate.getDate() + config.days);
    
    sequence.nextActionDate = nextDate.toISOString().split('T')[0];
    sequence.nextChannel = config.channel;
  }

  runPendingActions(options = {}) {
    const { dryRun = false, autoSms = false } = options;
    const state = this.readState();
    const today = new Date().toISOString().split('T')[0];
    const actions = [];

    for (const sequence of state.sequences) {
      if (sequence.status !== 'active') continue;
      if (!sequence.nextActionDate || sequence.nextActionDate > today) continue;

      const nextStep = sequence.currentStep + 1;
      const config = SEQUENCE_CONFIG.find(c => c.step === nextStep);
      
      if (!config) continue;

      const action = {
        sequenceId: sequence.id,
        email: sequence.email,
        name: sequence.name,
        company: sequence.company,
        phone: sequence.phone,
        step: nextStep,
        channel: config.channel,
        action: config.action,
        template: config.template
      };

      // Skip SMS steps if no phone number
      if (config.channel === 'sms' && !sequence.phone) {
        action.skipped = true;
        action.reason = 'No phone number provided';
        
        // Record in history and move to next step
        sequence.history.push({
          step: nextStep,
          date: today,
          channel: config.channel,
          action: `${config.action} (skipped - no phone)`
        });
        sequence.currentStep = nextStep;
        this.setNextAction(sequence);
        actions.push(action);
        continue;
      }

      // Execute the action
      if (!dryRun) {
        this.executeAction(sequence, config, autoSms);
        
        // Update sequence state
        sequence.history.push({
          step: nextStep,
          date: today,
          channel: config.channel,
          action: config.action
        });
        sequence.currentStep = nextStep;
        
        if (config.channel === 'end') {
          sequence.status = 'cold';
          sequence.nextActionDate = null;
          sequence.nextChannel = null;
        } else {
          this.setNextAction(sequence);
        }
      }

      actions.push(action);
    }

    if (!dryRun && actions.length > 0) {
      this.writeState(state);
    }

    return actions;
  }

  executeAction(sequence, config, autoSms) {
    switch (config.channel) {
      case 'sms':
        if (autoSms && sequence.phone) {
          try {
            const cmd = `node ${SMS_SCRIPT} --to="${sequence.phone}" --name="${sequence.name}" --template="${config.template}" --company="${sequence.company}"`;
            execSync(cmd, { stdio: 'pipe' });
            console.log(`✓ SMS sent to ${sequence.name} at ${sequence.phone}`);
          } catch (error) {
            console.error(`✗ SMS failed for ${sequence.name}: ${error.message}`);
          }
        }
        break;
      case 'email':
        // Email details will be handled by caller
        console.log(`📧 Email action needed for ${sequence.name} (${sequence.email}): ${config.action}`);
        break;
      case 'linkedin':
        console.log(`🔗 LinkedIn action needed for ${sequence.name}: ${config.action}`);
        break;
      case 'end':
        console.log(`❄️  Marking ${sequence.name} as cold (no response after 14 days)`);
        break;
    }
  }

  getStatus() {
    const state = this.readState();
    const today = new Date().toISOString().split('T')[0];
    
    const stats = {
      total: state.sequences.length,
      active: state.sequences.filter(s => s.status === 'active').length,
      completed: state.sequences.filter(s => s.status === 'completed').length,
      cold: state.sequences.filter(s => s.status === 'cold').length,
      dueToday: state.sequences.filter(s => 
        s.status === 'active' && 
        s.nextActionDate && 
        s.nextActionDate <= today
      ).length
    };

    return { stats, sequences: state.sequences };
  }
}

// CLI handling
function showHelp() {
  console.log(`
Multi-Channel Sequence Orchestrator

Usage:
  node sequence-orchestrator.js --add --email="email" --name="name" --company="company" [--phone="phone"]
  node sequence-orchestrator.js --run [--dry-run] [--auto-sms]
  node sequence-orchestrator.js --status
  node sequence-orchestrator.js --remove --email="email"

Examples:
  # Add a lead to sequence
  node sequence-orchestrator.js --add --email="tom@company.com" --name="Tom Bulger" --company="Byron" --phone="+15551234567"

  # Run pending actions (dry run)
  node sequence-orchestrator.js --run --dry-run

  # Run pending actions with auto SMS
  node sequence-orchestrator.js --run --auto-sms

  # Check status
  node sequence-orchestrator.js --status

  # Remove a lead
  node sequence-orchestrator.js --remove --email="tom@company.com"

Flags:
  --dry-run    Show what would happen without taking action
  --auto-sms   Actually send SMS via sms-touch.js (default: just report)
`);
}

function parseArgs() {
  const args = {};
  
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    
    if (arg.startsWith('--')) {
      const [key, value] = arg.split('=');
      const keyName = key.replace('--', '');
      
      if (value) {
        args[keyName] = value.replace(/"/g, '');
      } else {
        args[keyName] = true;
      }
    }
  }
  
  return args;
}

// CLI interface
if (require.main === module) {
  const args = parseArgs();
  const orchestrator = new SequenceOrchestrator();

  try {
    if (args.help || Object.keys(args).length === 0) {
      showHelp();
    } else if (args.add) {
      if (!args.email || !args.name || !args.company) {
        console.error('Error: --email, --name, and --company are required for --add');
        process.exit(1);
      }
      
      const sequence = orchestrator.addToSequence(args.email, args.name, args.company, args.phone);
      console.log(`✓ Added ${sequence.name} to sequence (ID: ${sequence.id})`);
      console.log(`  Next action: ${sequence.nextChannel} on ${sequence.nextActionDate}`);
      
    } else if (args.run) {
      const actions = orchestrator.runPendingActions({ 
        dryRun: args['dry-run'], 
        autoSms: args['auto-sms'] 
      });
      
      if (actions.length === 0) {
        console.log('No pending actions today');
      } else {
        console.log(`\n${args['dry-run'] ? '[DRY RUN] ' : ''}Found ${actions.length} pending action(s):\n`);
        
        actions.forEach(action => {
          if (action.skipped) {
            console.log(`⏭️  SKIPPED: ${action.name} - ${action.action} (${action.reason})`);
          } else {
            const icon = action.channel === 'sms' ? '📱' : action.channel === 'email' ? '📧' : '🔗';
            console.log(`${icon} ${action.channel.toUpperCase()}: ${action.name} - ${action.action}`);
            
            if (action.channel === 'sms' && !args['auto-sms']) {
              console.log(`   Command: node ${SMS_SCRIPT} --to="${action.phone}" --name="${action.name}" --template="${action.template}" --company="${action.company}"`);
            }
          }
        });
      }
      
    } else if (args.status) {
      const { stats, sequences } = orchestrator.getStatus();
      
      console.log('\nSequence Status:');
      console.log(`  Total sequences: ${stats.total}`);
      console.log(`  Active: ${stats.active}`);
      console.log(`  Completed: ${stats.completed}`);
      console.log(`  Cold: ${stats.cold}`);
      console.log(`  Due today: ${stats.dueToday}`);
      
      if (sequences.length > 0) {
        console.log('\nActive Sequences:');
        sequences
          .filter(s => s.status === 'active')
          .forEach(seq => {
            console.log(`  ${seq.name} (${seq.email}) - Step ${seq.currentStep}, Next: ${seq.nextChannel} on ${seq.nextActionDate}`);
          });
      }
      
    } else if (args.remove) {
      if (!args.email) {
        console.error('Error: --email is required for --remove');
        process.exit(1);
      }
      
      const removed = orchestrator.removeFromSequence(args.email);
      console.log(`✓ Removed ${removed.name} from sequence`);
      
    } else {
      console.error('Invalid arguments. Use --help for usage information.');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Module exports
module.exports = {
  SequenceOrchestrator,
  addToSequence: (email, name, company, phone) => {
    const orchestrator = new SequenceOrchestrator();
    return orchestrator.addToSequence(email, name, company, phone);
  },
  runPendingActions: (options) => {
    const orchestrator = new SequenceOrchestrator();
    return orchestrator.runPendingActions(options);
  },
  getStatus: () => {
    const orchestrator = new SequenceOrchestrator();
    return orchestrator.getStatus();
  }
};