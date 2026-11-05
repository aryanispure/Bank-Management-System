USE BankManagement;

INSERT INTO Staff (Staff_Name, Staff_Mobile_No)
VALUES
('Rahul Sharma', '9876543210'),
('Priya Patil', '9876543211'),
('Sachin Telang', '9214214214');

INSERT INTO Customer
(Customer_Name, Customer_Address, Customer_Mobile_No, Customer_Email,
 DOB, Gender, Staff_ID)
VALUES
('Aryan Badgujar', 'Pune', '9123456780',
 'aryan@example.com', '2005-04-15', 'Male', 1),
('Rohit Patil', 'Mumbai', '9123456781',
 'rohit@example.com', '2004-07-20', 'Other', 1),
('Sneha Sharma', 'Nashik', '9123456782',
 'sneha@example.com', '2005-09-10', 'Female', 2),
 ('Akash Alatekar', 'Kolhapur', '8421463761',
 'akash@example.com', '1999-01-01', 'Male', 2);

INSERT INTO Account
(Customer_ID, Username, Password_Hash,
 Account_Amount, Transaction_Limit, Secure_Word)
VALUES
(1, 'aryan01', SHA2('DemoPass123!', 256),
 50000, 20000, 'demo1'),
(2, 'rohit02', SHA2('DemoPass456!', 256),
 30000, 15000, 'demo2'),
(3, 'sneha03', SHA2('DemoPass789!', 256),
 70000, 25000, 'demo3'),
(4, 'akyapakya', SHA2('DemoPass992!', 256),
 10000000, 10000, 'demo4');

INSERT INTO Transactions
(Account_ID, Transaction_Type, Amount,
 Date, Receiver_Account, Receiver_Name)
VALUES
(1, 'Transfer', 5000, '2026-10-10', '2', 'Rohit Patil'),
(2, 'Transfer', 2000, '2026-10-12', '3', 'Sneha Sharma'),
(3, 'Deposit', 10000, '2026-10-15', NULL, NULL),
(4, 'Withdraw', 6000, '2026-10-16', NULL, NULL);

INSERT INTO Payment
(Account_ID, Payment_Type, Payment_Amount,
 Biller_Name, Biller_Amount)
VALUES
(1, 'Electricity', 1500, 'MSEB', 1500),
(2, 'Mobile Recharge', 599, 'Jio', 599),
(3, 'Internet', 999, 'Airtel', 999);
