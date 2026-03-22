<?php
declare(strict_types=1);

namespace App\Service;

use App\Repository\UserRepository;
use App\Trait\TimestampableTrait;

class UserService implements UserServiceInterface
{
    use TimestampableTrait;

    public function __construct(
        private readonly UserRepository $repository,
    ) {}

    public function findAll(): array
    {
        return $this->repository->findAll();
    }

    public function findById(int $id): ?array
    {
        return $this->repository->find($id);
    }

    public static function create(UserRepository $repo): static
    {
        return new static($repo);
    }
}
