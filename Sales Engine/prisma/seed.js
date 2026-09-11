const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  // Sample leads from public/sample-leads.csv with scoring
  const sampleLeads = [
    {
      name: 'Alice Johnson',
      company: 'Acme Boutique Resort',
      website: 'acme.com',
      email: 'alice.johnson@acme.com',
      jobTitle: 'General Manager',
      location: 'New York, NY',
      city: 'New York',
      state: 'NY',
      industry: 'Hospitality',
      source: 'Sample',
      businessType: 'RESORT',
      classification: 'DIRECT_CUSTOMER',
      decisionMakerTier: 'TIER_1',
      relevanceScore: 95,
      intentScore: 25,
      buyingPowerScore: 85,
      intentSignals: JSON.stringify(['Luxury resort']),
    },
    {
      name: 'Bob Smith',
      company: 'Globex Premium Restaurant',
      website: 'globex.io',
      email: 'bob@globex.io',
      jobTitle: 'Owner',
      location: 'San Francisco, CA',
      city: 'San Francisco',
      state: 'CA',
      industry: 'Food & Beverage',
      source: 'Sample',
      businessType: 'RESTAURANT',
      classification: 'DIRECT_CUSTOMER',
      decisionMakerTier: 'TIER_1',
      relevanceScore: 90,
      intentScore: 30,
      buyingPowerScore: 75,
      intentSignals: JSON.stringify(['Restaurant owner', 'Likely seeking POS automation']),
    },
    {
      name: 'Carol Lee',
      company: 'Initech AI Solutions',
      website: 'initech.ai',
      email: 'carol.lee@initech.ai',
      jobTitle: 'VP of Engineering',
      location: 'Austin, TX',
      city: 'Austin',
      state: 'TX',
      industry: 'Technology',
      source: 'Sample',
      businessType: 'CONSULTANT',
      classification: 'CHANNEL_PARTNER',
      decisionMakerTier: 'TIER_1',
      relevanceScore: 70,
      intentScore: 20,
      buyingPowerScore: 65,
      intentSignals: JSON.stringify(['Tech consultant', 'Potential integration partner']),
    },
  ];

  console.log('Seeding database with sample leads...');

  for (const lead of sampleLeads) {
    try {
      const created = await prisma.lead.create({
        data: lead,
      });
      console.log(`Created lead: ${created.name} (Score: ${Math.round((created.relevanceScore + created.intentScore + created.buyingPowerScore) / 3)}/100)`);
    } catch (err) {
      if (err.code === 'P2002') {
        // Unique constraint violation - lead already exists
        console.log(`Lead already exists: ${lead.email}`);
      } else {
        console.error(`Error creating lead: ${err.message}`);
      }
    }
  }

  console.log('Seed complete!');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
