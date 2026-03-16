@echo off
cd /d "C:\Users\Jared\source\repos\JaredCH\SS\socialsecure\frontend"
npm test -- ./src/pages/Chat.test.js --no-coverage --testNamePattern="." 2>&1
